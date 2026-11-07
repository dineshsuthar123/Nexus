// Public-page browser measurements of an actual production Next.js build.
// node scripts/performance/frontend.cjs <existing-run-directory>
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const web = path.join(root, 'frontend/apps/web');
const ui = path.join(root, 'frontend/packages/ui');
const { chromium } = require(path.join(web, 'node_modules/@playwright/test'));
const next = require.resolve('next/dist/bin/next', { paths: [web] });
const output = path.resolve(process.argv[2] || 'loadtest/results/frontend');
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, NEXUS_PERFORMANCE: 'true', NEXT_PUBLIC_MOCK_MODE: 'false', NEXT_TELEMETRY_DISABLED: '1',
  NEXTAUTH_URL: 'http://127.0.0.1:13000', NEXTAUTH_SECRET: 'local-performance-only-not-a-production-secret' };

function run(args, logName, cwd = web, cli = next) {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(output, logName), 'w');
    const child = spawn(process.execPath, [cli, ...args], { cwd, env, stdio: ['ignore', log, log], windowsHide: true });
    child.on('error', reject);
    child.on('close', code => { fs.closeSync(log); code === 0 ? resolve() : reject(new Error(`next ${args[0]} exited ${code}; see ${logName}`)); });
  });
}

async function main() {
  const started = performance.now();
  console.log('Building production frontend...');
  const tsupPackage = require.resolve('tsup/package.json', { paths: [ui] });
  const tsupBin = require(tsupPackage).bin.tsup;
  await run(['src/index.ts', '--format', 'cjs,esm', '--dts', '--external', 'react'], 'frontend-ui-build.log', ui,
    path.join(path.dirname(tsupPackage), tsupBin));
  await run(['build'], 'frontend-build.log');
  const result = { measured_at: new Date().toISOString(), build_seconds: (performance.now() - started) / 1000,
    node: process.version, next: require(path.join(web, 'node_modules/next/package.json')).version,
    mode: 'production Node server; .next-performance output; standalone packaging disabled; public pages; no API mocks; fresh browser context per navigation',
    viewport: { width: 1365, height: 768 }, samples_per_route: 10, routes: [],
    limitations: ['Local desktop browser without CPU or network throttling',
      'Ten samples per route; p95 is exploratory, not a field Core Web Vitals assessment',
      'Public navigation only; authenticated financial workflows are not measured',
      'LCP observed through load plus 800ms; late content and user interactions are outside the window'] };
  const serverLog = fs.openSync(path.join(output, 'frontend-server.log'), 'w');
  const server = spawn(process.execPath, [next, 'start', '-p', '13000', '-H', '127.0.0.1'], { cwd: web, env,
    stdio: ['ignore', serverLog, serverLog], windowsHide: true });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch('http://127.0.0.1:13000/')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Production frontend did not become ready');
    browser = await chromium.launch({ headless: true });
    result.browser = browser.version();
    for (const route of ['/', '/auth/login', '/performance']) {
      const samples = [];
      for (let index = 0; index < result.samples_per_route; index++) {
        const context = await browser.newContext({ viewport: result.viewport });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.addInitScript(() => {
          window.__perf = { lcp: null, cls: 0 };
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const response = await page.goto(`http://127.0.0.1:13000${route}`, { waitUntil: 'load' });
        if (response.status() !== 200 || new URL(page.url()).pathname !== route) throw new Error(`Unexpected response for ${route}`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(800);
        const sample = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const scripts = performance.getEntriesByType('resource').filter(entry => entry.initiatorType === 'script');
          return { ttfb_ms: nav.responseStart - nav.requestStart,
            dom_content_loaded_ms: nav.domContentLoadedEventEnd - nav.startTime,
            load_ms: nav.loadEventEnd - nav.startTime,
            fcp_ms: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
            lcp_ms: window.__perf.lcp, cls: window.__perf.cls,
            script_encoded_bytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
            script_requests: scripts.length };
        });
        sample.page_errors = pageErrors;
        if (pageErrors.length) throw new Error(`${route}: ${pageErrors.join('; ')}`);
        samples.push(sample);
        if (index === 0) await page.screenshot({ path: path.join(output, `frontend-${route.replace(/\W/g, '') || 'home'}.png`), fullPage: true });
        await context.close();
      }
      result.routes.push({ path: route, samples });
      console.log(`Measured ${route}: ${samples.length} cold-context navigations`);
    }
    // Tie browser results to all application, UI, and build configuration inputs.
    const hash = createHash('sha256');
    function fingerprint(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) fingerprint(file);
        else { hash.update(path.relative(root, file)); hash.update(fs.readFileSync(file)); }
      }
    }
    fingerprint(path.join(web, 'src'));
    fingerprint(path.join(root, 'frontend/packages/ui/src'));
    for (const name of ['next.config.js', 'package.json', 'tailwind.config.ts', 'tsconfig.json']) hash.update(fs.readFileSync(path.join(web, name)));
    result.source_sha256 = hash.digest('hex');
    fs.writeFileSync(path.join(output, 'frontend.json'), JSON.stringify(result, null, 2) + '\n');
  } finally {
    if (browser) await browser.close();
    const closed = new Promise(resolve => server.once('close', resolve));
    server.kill();
    await closed;
    fs.closeSync(serverLog);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
