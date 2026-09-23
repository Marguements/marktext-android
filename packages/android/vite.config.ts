import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Builds the editor UI into the APK's assets. MainActivity serves it through
// WebViewAssetLoader at https://appassets.androidplatform.net/assets/www/.
export default defineConfig({
  root: resolve(__dirname, 'web'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'app/src/main/assets/www'),
    emptyOutDir: true,
    // Android System WebView is evergreen Chromium; OnePlus 12 ships >= 120.
    target: 'chrome110',
    // Mermaid, Vega and KaTeX are large; they load from local assets, not the network.
    chunkSizeWarningLimit: 6000
  }
})
