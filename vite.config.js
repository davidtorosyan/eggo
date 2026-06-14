import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Absolute sub-path base for GitHub Pages (served at /eggo/). PWA needs an
  // absolute base so the service-worker scope + manifest paths resolve correctly.
  base: '/eggo/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // new deploys take over silently on next load
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Eggo — egg tracker',
        short_name: 'Eggo',
        description: 'Fast, keyboard-free logging for a backyard egg flock.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf6f0',
        theme_color: '#faf6f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
