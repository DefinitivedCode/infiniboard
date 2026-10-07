import { createRoot } from 'react-dom/client'
import Dexie from 'dexie'
import { App } from '../../src/app/App'
import { initializePersistence } from '../../src/data/persistence'
import { replaceProject } from '../../src/data/replaceProject'
import { showcaseProject } from '../fixtures/showcase'
import '../../src/app/tokens.css'

// Use a disposable origin/profile. Seed only a genuinely fresh database; never
// replace a saved project. This entry renders the real app without debug chrome.
if (import.meta.env.DEV) {
  const fresh = !await Dexie.exists('infiniboard')
  await initializePersistence()
  if (fresh) replaceProject(showcaseProject())
  const root = createRoot(document.getElementById('root')!)
  root.render(<App />)
  import.meta.hot?.dispose(() => root.unmount())
}
