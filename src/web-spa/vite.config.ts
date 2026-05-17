import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Local Worker (`wrangler dev` / HTTP transport on port 3001). */
const workerDevTarget = 'http://localhost:3001';

const workerDevProxy = {
  target: workerDevTarget,
  changeOrigin: true,
} as const;

/** Worker-owned routes required for hosted sign-in and MCP OAuth during SPA dev. */
const workerDevProxyPrefixes = [
  '/api',
  '/mcp',
  '/sse',
  '/auth',
  '/oauth',
  '/token',
  '/register',
  '/health',
  '/.well-known',
] as const;

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '../../.spa-dist'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(workerDevProxyPrefixes.map((prefix) => [prefix, workerDevProxy])),
  },
});
