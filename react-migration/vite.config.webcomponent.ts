import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from "@tailwindcss/vite"
import path from 'path'

// Web Component 전용 빌드 설정
export default defineConfig({
  plugins: [
    react({
      jsxImportSource: 'react',
    }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/webcomponent/index.tsx'),
      name: 'OpenWebUIChat',
      fileName: 'open-webui-chat',
      formats: ['es', 'umd']
    },
    outDir: 'dist-webcomponent',
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    },
    cssCodeSplit: false,
    minify: 'esbuild',
    sourcemap: true
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    global: 'globalThis',
  }
})