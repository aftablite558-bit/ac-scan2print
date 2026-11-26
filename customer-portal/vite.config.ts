import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const PORTAL_DIR = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: PORTAL_DIR,
  envDir: path.resolve(PORTAL_DIR, '..'),
  publicDir: path.resolve(PORTAL_DIR, 'public'),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(PORTAL_DIR, '../dist-customer'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 4173,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  preview: {
    port: 4173,
  },
});
