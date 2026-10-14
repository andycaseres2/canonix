// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  security: { checkOrigin: true },
  vite: {
    // The reader and the uploader import these on demand; pre-bundling them at startup avoids
    // "Failed to fetch dynamically imported module" when Vite would otherwise discover them mid-session
    optimizeDeps: { include: ['fflate', 'pdfjs-dist', 'libarchive.js'] },
  },
});
