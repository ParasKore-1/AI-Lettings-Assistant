import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.KEYRING_API_PROXY ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin /api in development: no CORS, and SSE flows through untouched.
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Long-lived vendor chunk for React + router; everything else is split by Rollup.
        manualChunks(id) {
          if (/node_modules[/\\](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[/\\]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
