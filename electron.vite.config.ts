import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@core': resolve('packages/core/src'),
        '@database': resolve('packages/database/src'),
        '@shared': resolve('packages/shared/src')
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@core': resolve('packages/core/src'),
        '@shared': resolve('packages/shared/src')
      }
    },
    plugins: [react()]
  }
})
