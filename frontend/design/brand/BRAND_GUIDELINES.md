# Nexus RTP Brand Guidelines

## Version 1.0 | February 2026

---

## 1. Brand Overview

### Mission Statement
Nexus RTP provides secure, precise, and globally-connected real-time payment infrastructure for banks, fintechs, and enterprises.

### Brand Pillars
- **Trustworthy** — Enterprise-grade security with cryptographic proofs
- **Precise** — Exactly-once processing, deterministic replay
- **Global** — Multi-currency, multi-region, always available
- **Transparent** — Signed audit bundles, regulatory-ready

---

## 2. Logo System

### Primary Logo
The Nexus logo consists of a logomark (symbol) and logotype (wordmark).

#### Logomark Concept
- Interconnected nodes forming a hexagonal network
- Represents global payment rails and connectivity
- Shield-like structure conveys security

#### Logo Variations
| Variant | Usage |
|---------|-------|
| Full (Horizontal) | Primary use in headers, marketing |
| Full (Stacked) | Square spaces, app icons |
| Logomark Only | Favicon, small spaces, watermarks |
| Logotype Only | When paired with other brand elements |

### Logo Files
```
design/brand/
├── logo/
│   ├── nexus-logo-full-color.svg
│   ├── nexus-logo-full-white.svg
│   ├── nexus-logo-full-dark.svg
│   ├── nexus-logomark-color.svg
│   ├── nexus-logomark-white.svg
│   ├── nexus-logotype-color.svg
│   └── nexus-logotype-white.svg
├── favicon/
│   ├── favicon.ico
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png (180x180)
│   └── android-chrome-192x192.png
└── social/
    ├── og-image.png (1200x630)
    └── twitter-card.png (1200x600)
```

### Clear Space
Maintain minimum clear space equal to the height of the "N" in Nexus around all sides of the logo.

### Minimum Sizes
| Format | Minimum Width |
|--------|---------------|
| Print | 1 inch (25mm) |
| Digital | 80px |
| Favicon | 16px (logomark only) |

### Logo Don'ts
❌ Do not stretch or distort  
❌ Do not change colors arbitrarily  
❌ Do not add effects (shadows, glows)  
❌ Do not place on busy backgrounds  
❌ Do not rotate or skew  

---

## 3. Color Palette

### Primary Colors

#### Navy Blue (Primary)
The foundation of the Nexus brand, conveying trust and professionalism.

| Swatch | Hex | RGB | Usage |
|--------|-----|-----|-------|
| Primary 900 | #1A1A2E | 26, 26, 46 | Headers, primary text |
| Primary 800 | #1E3A8A | 30, 58, 138 | Dark backgrounds |
| Primary 700 | #1E40AF | 30, 64, 175 | Active states |
| Primary 600 | #1D4ED8 | 29, 78, 216 | Hover states |
| **Primary 500** | **#2563EB** | 37, 99, 235 | **Primary brand** |
| Primary 400 | #4A89CF | 74, 137, 207 | Links |
| Primary 100 | #C2D9F2 | 194, 217, 242 | Backgrounds |
| Primary 50 | #E6F0FA | 230, 240, 250 | Subtle backgrounds |

#### Teal (Secondary)
Accent color for CTAs, success states, and highlights.

| Swatch | Hex | RGB | Usage |
|--------|-----|-----|-------|
| Secondary 700 | #0F766E | 15, 118, 110 | Active states |
| **Secondary 600** | **#0D9488** | 13, 148, 136 | **Hover states** |
| **Secondary 500** | **#14B8A6** | 20, 184, 166 | **Secondary brand** |
| Secondary 300 | #5EEAD4 | 94, 234, 212 | Highlights |
| Secondary 100 | #CCFBF1 | 204, 251, 241 | Backgrounds |

#### Gold (Accent)
Premium accent for special elements.

| Swatch | Hex | Usage |
|--------|-----|-------|
| Gold 500 | #F59E0B | Premium features, highlights |
| Gold Light | #FCD34D | Hover states |
| Gold Dark | #D97706 | Active states |

### Semantic Colors

| Intent | Color | Hex | Contrast (on white) |
|--------|-------|-----|---------------------|
| Success | Green | #22C55E | 3.5:1 ✓ Large text |
| Success Dark | Green | #16A34A | 4.6:1 ✓ AA |
| Warning | Amber | #F59E0B | 3.0:1 ✓ Large text |
| Warning Dark | Amber | #D97706 | 4.5:1 ✓ AA |
| Danger | Red | #EF4444 | 4.0:1 ✓ Large text |
| Danger Dark | Red | #DC2626 | 5.5:1 ✓ AA |
| Info | Blue | #3B82F6 | 3.5:1 ✓ Large text |

### Neutral Palette

| Swatch | Hex | Usage |
|--------|-----|-------|
| White | #FFFFFF | Backgrounds |
| Neutral 50 | #F8FAFC | Page background |
| Neutral 100 | #F1F5F9 | Card backgrounds |
| Neutral 200 | #E2E8F0 | Borders |
| Neutral 300 | #CBD5E1 | Dividers |
| Neutral 400 | #94A3B8 | Placeholder text |
| Neutral 500 | #64748B | Secondary text |
| Neutral 600 | #475569 | Icons |
| Neutral 700 | #334155 | Body text |
| Neutral 800 | #1E293B | Headings |
| Neutral 900 | #0F172A | Primary text |

### Accessibility Notes

All color combinations must meet WCAG 2.1 AA standards:
- **Normal text (< 18px):** 4.5:1 contrast ratio
- **Large text (≥ 18px or 14px bold):** 3:1 contrast ratio
- **UI components:** 3:1 contrast ratio

#### Verified Combinations ✓
- Primary 900 on White: 16.1:1 ✓✓✓
- Primary 500 on White: 4.5:1 ✓ AA
- Secondary 600 on White: 4.6:1 ✓ AA
- Neutral 700 on White: 8.5:1 ✓✓
- White on Primary 700: 8.2:1 ✓✓

---

## 4. Typography

### Font Families

#### Primary: Inter
A modern, highly legible sans-serif designed for screens.

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

Download: https://fonts.google.com/specimen/Inter

#### Monospace: JetBrains Mono
For code, transaction IDs, and technical data.

```css
font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
```

### Type Scale

| Name | Size | Line Height | Weight | Usage |
|------|------|-------------|--------|-------|
| Display | 60px | 1.0 | 700 | Hero headlines |
| H1 | 48px | 1.1 | 700 | Page titles |
| H2 | 36px | 1.2 | 600 | Section headers |
| H3 | 30px | 1.3 | 600 | Subsections |
| H4 | 24px | 1.4 | 600 | Card titles |
| H5 | 20px | 1.4 | 600 | Small headings |
| H6 | 18px | 1.5 | 600 | Captions |
| Body Large | 18px | 1.75 | 400 | Lead paragraphs |
| Body | 16px | 1.5 | 400 | Default body |
| Body Small | 14px | 1.4 | 400 | Secondary text |
| Caption | 12px | 1.3 | 400 | Labels, metadata |
| Overline | 12px | 1.3 | 600 | Uppercase labels |

### Font Weights
- **400 (Regular):** Body text, descriptions
- **500 (Medium):** Emphasized text, buttons
- **600 (Semibold):** Headings, labels
- **700 (Bold):** Hero titles, important callouts

---

## 5. Spacing System

Based on a 4px unit grid (8-point grid for major spacing).

| Token | Value | Usage |
|-------|-------|-------|
| space-0 | 0 | — |
| space-1 | 4px | Tight spacing |
| space-2 | 8px | Icon-text gap |
| space-3 | 12px | Small padding |
| space-4 | 16px | Default padding |
| space-5 | 20px | Medium padding |
| space-6 | 24px | Section spacing |
| space-8 | 32px | Large spacing |
| space-10 | 40px | Card padding |
| space-12 | 48px | Section margins |
| space-16 | 64px | Major sections |
| space-20 | 80px | Page margins |
| space-24 | 96px | Hero spacing |

---

## 6. Motion & Animation

### Timing

| Name | Duration | Usage |
|------|----------|-------|
| Fast | 100ms | Micro-interactions (hover) |
| Normal | 150ms | Standard transitions |
| Slow | 200ms | Complex transitions |
| Slower | 300ms | Page transitions |
| Slowest | 500ms | Dramatic reveals |

### Easing

| Name | Curve | Usage |
|------|-------|-------|
| Ease In Out | cubic-bezier(0.4, 0, 0.2, 1) | Default |
| Ease Out | cubic-bezier(0, 0, 0.2, 1) | Exit animations |
| Ease In | cubic-bezier(0.4, 0, 1, 1) | Enter animations |
| Spring | cubic-bezier(0.34, 1.56, 0.64, 1) | Playful bounces |

### Reduced Motion
Always respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```

---

## 7. Iconography

### Icon System
- Primary: **Lucide React** (consistent, MIT licensed)
- Size: 20px default, 16px small, 24px large
- Stroke: 1.5px (matches Inter's weight)
- Color: Inherit from text color

### Common Icons

| Action | Icon | Notes |
|--------|------|-------|
| Add | Plus | Primary CTA color |
| Edit | Pencil | — |
| Delete | Trash2 | Danger color |
| View | Eye | — |
| Download | Download | — |
| Settings | Settings | — |
| Search | Search | — |
| Filter | Filter | — |
| Refresh | RefreshCw | Animated on loading |
| Success | CheckCircle | Success color |
| Warning | AlertTriangle | Warning color |
| Error | XCircle | Danger color |
| Info | Info | Info color |

---

## 8. Component Patterns

### Buttons

| Variant | Background | Text | Usage |
|---------|------------|------|-------|
| Primary | Primary 500 | White | Main CTAs |
| Secondary | Secondary 500 | White | Secondary actions |
| Outline | Transparent | Primary 500 | Tertiary actions |
| Ghost | Transparent | Neutral 700 | Low emphasis |
| Danger | Danger 500 | White | Destructive actions |

### Cards
- Border radius: 12px (lg)
- Shadow: md (default), lg (hover)
- Padding: 24px (space-6)
- Background: White

### Forms
- Input height: 44px (accessibility)
- Border radius: 6px (default)
- Focus ring: 2px Primary 500 with 2px offset
- Error state: Danger 500 border + error message

---

## 9. Dark Mode

### Color Mapping

| Light | Dark |
|-------|------|
| Neutral 50 (bg) | Neutral 900 |
| White (card) | Neutral 800 |
| Neutral 900 (text) | Neutral 50 |
| Neutral 200 (border) | Neutral 700 |
| Primary 500 | Primary 400 |
| Secondary 500 | Secondary 400 |

### Implementation
Use CSS custom properties with `prefers-color-scheme`:
```css
:root { --color-bg: #F8FAFC; }
@media (prefers-color-scheme: dark) {
  :root { --color-bg: #0F172A; }
}
```

---

## 10. Co-Branding

### Partner Logo Placement
- Partner logos appear to the right of Nexus logo
- Separated by a vertical divider (Neutral 300)
- Equal height, maintain aspect ratios
- Minimum 24px spacing between logos

### "Powered by Nexus" Badge
For white-label integrations:
- Subtle placement in footer
- Use logomark + "Powered by Nexus" text
- Size: 120px wide maximum

---

## Contact

For brand questions or asset requests:
- Email: brand@nexusrtp.io
- Design System: ui.nexusrtp.io/storybook

---

*© 2026 Nexus RTP. All rights reserved.*
