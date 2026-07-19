/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/excelService.test.ts', '**/node_modules/**'],
  },
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
    emptyOutDir: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules/@react-pdf')) {
            return 'react-pdf';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react-router')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/xlsx')) {
            return 'sheetjs';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'recharts';
          }
        },
      },
    },
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'xlsx', 'recharts'],
  },
});
