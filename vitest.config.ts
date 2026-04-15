/**
 * Vitest config for the renderer unit tests.
 *
 * `electron.vite.config.ts` is the electron-vite build config and is
 * not automatically picked up by vitest, so existing tests have had to
 * use relative paths or type-only imports to get around the `@/` alias.
 * This file makes the `@` alias available in test runtime imports so
 * tests can mirror the import paths used in production code.
 *
 * Added during Task F1 of the hermes-desktop fallback visibility design.
 */
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
})
