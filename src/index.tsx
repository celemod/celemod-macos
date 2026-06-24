import { createRoot } from 'react-dom/client'
import App from './App'
import { getPlatform } from './env'
// @ts-ignore
import './globals.css'

function syncDarkMode() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', isDark)
}

async function init() {
  syncDarkMode()

  // Listen for system appearance changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncDarkMode)

  // Set platform attribute on html element
  const platform = await getPlatform()
  document.documentElement.setAttribute('platform', platform)

  // F5 reload
  window.addEventListener('keyup', (evt) => {
    if (evt.code === 'F5') {
      window.location.reload()
    }
  })

  const root = document.getElementById('root')!
  createRoot(root).render(<App />)
}

init()
