import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// HMR 지원을 위한 개발 모드 체크
if (import.meta.env.DEV) {
  // HMR 설정
  if (import.meta.hot) {
    import.meta.hot.accept()
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
