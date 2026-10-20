import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './core/design-system/components.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
