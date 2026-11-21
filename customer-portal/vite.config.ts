import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname),
  envDir: path.resolve(__dirname, '..'),
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '../dist-customer'),
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
