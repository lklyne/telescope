import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initRendererSentry } from '../shared/sentry-init'
import type { ChromeHeaderElectronAPI } from '../../shared/types'

initRendererSentry()

const api = (window as unknown as { electronAPI: ChromeHeaderElectronAPI }).electronAPI

async function bootstrap() {
  const initialData = await api.getInitialData()
  document.documentElement.classList.toggle('dark', initialData.theme.isDark)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
