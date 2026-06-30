import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * Vitest configuration file.
 * Configures path resolve aliases so Vitest can execute integration tests
 * containing path mappings (@shared/*, @core/*, @database/*) accurately.
 */
export default defineConfig({
  test: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared/src'),
      '@core': resolve(__dirname, 'packages/core/src'),
      '@database': resolve(__dirname, 'packages/database/src')
    },
    // Exclude Electron files and focus on packages testing
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**']
  }
})
