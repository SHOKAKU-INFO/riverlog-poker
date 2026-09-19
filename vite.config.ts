import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({ plugins: [react(), VitePWA({
  registerType: 'autoUpdate',
  injectRegister: null,
  manifest: false,
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [{ urlPattern: /^https:\/\/api\.frankfurter\.dev\//, handler: 'NetworkFirst', options: { cacheName: 'exchange-rates', expiration: { maxEntries: 40, maxAgeSeconds: 86_400 } } }],
  },
})] })
