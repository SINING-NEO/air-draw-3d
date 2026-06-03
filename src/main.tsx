import { createRoot } from 'react-dom/client'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
)
