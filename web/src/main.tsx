import { createRoot } from 'react-dom/client'
import { DcProvider } from '@damage-control/ui'
import '@damage-control/ui/fonts.css'
import '@damage-control/ui/styles.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <DcProvider density="touch">
    <App />
  </DcProvider>,
)
