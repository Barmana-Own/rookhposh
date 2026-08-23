import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/pro-api': {
        target: 'http://91.107.232.169:6000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pro-api/, ''),
      },
    },
  },
});
