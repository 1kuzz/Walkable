import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
  ],
  server: {
    open: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          /* Bundle the React runtime + router into a single vendor chunk */
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/react-router/')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
    // Drop console.* calls and debugger statements from production bundles
    // to eliminate debug artifacts and reduce information disclosure.
    ...(mode === 'production' ? {
      minify: 'esbuild',
    } : {}),
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  } : {},
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/tests/setup.ts'],
    exclude: ['node_modules', 'dist', 'e2e', '**/e2e/**', 'backend'],
  },
}))
