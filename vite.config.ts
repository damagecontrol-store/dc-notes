import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: 'web',
  // GitHub Pages serves a project site under /<repo>/; set BASE=/ for a custom domain
  base: process.env.BASE ?? '/dc-notes/',
  build: { outDir: 'dist', emptyOutDir: true },
  // the design system is a file: link with its own react copy; two copies break hooks
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Damage Control Notes',
        short_name: 'DC Notes',
        // relative to the manifest, so the app works under any base path
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#01190C',
        theme_color: '#01190C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
