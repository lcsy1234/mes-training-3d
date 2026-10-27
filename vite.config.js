import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  publicDir: 'model-library',
  build: { rollupOptions: { input: { factory: fileURLToPath(new URL('./index.html', import.meta.url)), basic: fileURLToPath(new URL('./basic.html', import.meta.url)), campaign: fileURLToPath(new URL('./campaign.html', import.meta.url)) } } },
});
