import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Local edge worker (`pnpm run dev:workers`, default port 8787). */
const workerDevTarget = process.env.VITE_WORKER_DEV_TARGET ?? 'http://localhost:8787';
const spaRoot = import.meta.dirname;

const workerDevProxy = {
  target: workerDevTarget,
  changeOrigin: true,
} as const;

/** Worker-owned routes required for hosted sign-in and MCP OAuth during SPA dev. */
const workerDevProxyPrefixes = [
  '/api',
  '/mcp',
  '/auth',
  '/oauth',
  '/token',
  '/register',
  '/health',
  '/.well-known',
] as const;

export default defineConfig({
  root: path.resolve(spaRoot),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(spaRoot, '../../.spa-dist'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(spaRoot, 'index.html'),
      output: {
        entryFileNames: 'app/spa.js',
        chunkFileNames: 'app/chunks/[name]-[hash].js',
        assetFileNames: 'app/spa.[ext]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(workerDevProxyPrefixes.map((prefix) => [prefix, workerDevProxy])),
  },
});
