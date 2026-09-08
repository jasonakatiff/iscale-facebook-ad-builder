import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installTelemetry } from './lib/telemetry'
const stopTelemetry = installTelemetry()
if (import.meta.hot) import.meta.hot.dispose(stopTelemetry)
import { APP_TITLE } from './lib/branding'
document.title = APP_TITLE
import { ThemeProvider } from './context/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><App /></ThemeProvider>
  </StrictMode>,
)
