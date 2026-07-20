import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  // Cast: apps/web resolves its own vite copy via @vitejs/plugin-react while
  // vitest brings another, so the Plugin types are structurally identical but
  // nominally distinct.
  plugins: [react()] as never,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../shared'),
      '@config': path.resolve(__dirname, '../../config'),
    },
  },
})
