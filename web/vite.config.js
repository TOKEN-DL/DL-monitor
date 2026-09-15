import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    {
      // 自定义插件：在 writeBundle 钩子里直接复制 sw.js 和 manifest.json
      name: 'copy-public-assets',
      apply: 'build',
      closeBundle: async () => {
        const src = (p) => resolve(__dirname.replace(/\\/g, '/'), '../public', p);
        const dst = (p) => resolve(__dirname.replace(/\\/g, '/'), 'dist', p);
        const items = ['sw.js', 'manifest.json'];
        for (const f of items) {
          const s = src(f);
          const d = dst(f);
          if (existsSync(s)) {
            copyFileSync(s, d);
            console.log('[copy]', f);
          }
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});