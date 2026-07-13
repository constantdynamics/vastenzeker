import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Ruim de oude service-worker-cache van tips op: daar kon een leeg
// API-antwoord in blijven hangen waardoor de app dacht dat er geen tips waren.
if ('caches' in window) {
  caches.delete('if-tips').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
