import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from "@tailwindcss/vite"
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 환경 변수 로드
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
  plugins: [
    react({
      // React 19 호환성을 위한 JSX 런타임 설정
      jsxImportSource: 'react',
      // SWC와 Fast Refresh 설정
      // devTarget: 개발 중 변환 대상 (기본값은 es2020)
      devTarget: 'es2022',
      // tsDecorators: TypeScript 데코레이터 지원
      tsDecorators: false,
      // parserConfig: 파일별 파서 설정
      parserConfig(id) {
        // 모든 .tsx 파일에 대해 명시적으로 JSX 파싱 활성화
        if (id.endsWith('.tsx')) return { syntax: 'typescript', tsx: true }
        if (id.endsWith('.ts')) return { syntax: 'typescript', tsx: false }
        if (id.endsWith('.jsx')) return { syntax: 'ecmascript', jsx: true }
        if (id.endsWith('.js')) return { syntax: 'ecmascript', jsx: false }
      },
    }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // React 중복 인스턴스 방지
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@heroui/react', 
      '@heroui/theme', 
      'framer-motion'
    ],
    force: true,
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: [],
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@heroui/react', '@heroui/theme'],
        },
      },
    },
  },
  define: {
    // React 19 전역 변수 설정
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    global: 'globalThis',
    __DEV__: process.env.NODE_ENV !== 'production',
  },
  // HMR 디버깅을 위한 로그 레벨 설정
  logLevel: 'info',
  server: {
    port: parseInt(env.VITE_DEV_PORT) || 5175,
    host: true,
    hmr: {
      port: parseInt(env.VITE_HMR_PORT) || 24679,
      overlay: env.VITE_HMR_OVERLAY !== 'false',
      protocol: 'ws',
      host: 'localhost',
    },
    watch: {
      usePolling: env.CHOKIDAR_USEPOLLING === 'true',
      interval: 1000,
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    },
    cors: true,
    fs: {
      strict: false,
    },
    // API 프록시 설정 (개발 환경에서만)
    proxy: mode === 'development' ? {
      '/api': {
        target: env.VITE_API_BASE_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
      '/ws': {
        target: env.VITE_WS_URL || 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    } : undefined,
  },
  preview: {
    port: 4173,
    host: true,
  },
  };
});
