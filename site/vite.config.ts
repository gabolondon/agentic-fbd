import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from the root of afbd.gabocodes.com by GitHub Pages.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
