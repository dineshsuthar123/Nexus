import type { Config } from 'tailwindcss';
import nexusPreset from '../../packages/ui/src/styles/tailwind-preset';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  presets: [nexusPreset],
  theme: {
    extend: {
      // App-specific customizations can go here
    },
  },
  plugins: [],
};

export default config;
