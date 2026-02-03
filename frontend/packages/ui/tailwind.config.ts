import type { Config } from 'tailwindcss';
import { nexusPreset } from './src/styles/tailwind-preset';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [nexusPreset],
  darkMode: 'class',
};

export default config;
