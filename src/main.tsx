import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initPWA } from './pwa'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

initPWA()
