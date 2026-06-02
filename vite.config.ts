import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 将 /api 请求代理到 Cloudflare Pages 部署地址，
      // 使 npm run dev 也能正常调用 R2 相关 API。
      // 如部署地址不同，请修改 target。
      '/api': {
        target: 'https://trading-review-app.pages.dev',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/stores': path.resolve(__dirname, './src/stores'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'sheetjs': ['xlsx'],
          'recharts': ['recharts'],
        },
      },
    },
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'xlsx', 'recharts'],
  },
});
