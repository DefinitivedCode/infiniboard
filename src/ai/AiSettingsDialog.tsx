import { useEffect, useRef, useState } from 'react'
import { Icon } from '../app/Icon'
import { settingsSchema } from './settings'
import type { AiSettings } from './settings'
import styles from './Assistant.module.css'

type Props = { settings: AiSettings; save: (settings: AiSettings) => Promise<void>; saved: (settings: AiSettings) => void; close: () => void }
export function AiSettingsDialog({ settings, save, saved, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  const persist = async (clear = false) => {
    const value = clear ? { ...settings, apiKey: '', rememberKey: false } : draft
    const parsed = settingsSchema.safeParse(value)
    if (!parsed.success) { setError('Enter a model ID and valid settings.'); return }
    setBusy(true); setError('')
    try {
      await save(parsed.data); saved(parsed.data)
      if (clear) setDraft(s => ({ ...s, apiKey: '', rememberKey: false })); else close()
    } catch { setError('Could not save AI settings in browser storage. Try again.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="ai-settings-title" onKeyDown={e => e.stopPropagation()} onCancel={e => { if (busy) e.preventDefault(); else close() }}>
    <div className={styles.heading}><h2 id="ai-settings-title">AI settings</h2><button aria-label="Close AI settings" disabled={busy} onClick={close}><Icon name="close" /></button></div>
    <form onSubmit={e => { e.preventDefault(); void persist() }}>
      <label className={styles.field}>OpenAI API key<input type="password" autoComplete="off" spellCheck={false} value={draft.apiKey} disabled={busy} onChange={e => setDraft(s => ({ ...s, apiKey: e.target.value }))} /></label>
      <button type="button" disabled={busy || (!settings.apiKey && !draft.apiKey)} onClick={() => { void persist(true) }}>Clear key</button>
      <label className={styles.check}><input type="checkbox" checked={draft.rememberKey} disabled={busy} onChange={e => setDraft(s => ({ ...s, rememberKey: e.target.checked }))} />Remember on this device</label>
      <p className={styles.hint}>Your key stays in this tab’s memory until reload or close. If remembered, it is saved in IndexedDB for this browser profile and site only. Clear key removes both copies. Previously saved keys without this opt-in have been cleared.</p>
      <p className={styles.hint}>Generate sends your key and supplied text directly to OpenAI, never to Infiniboard’s host. Keys are excluded from project files and Graph Context. Code running on this page can access the key; browser storage does not make it perfectly secure.</p>
      <label className={styles.field}>Model ID<input value={draft.model} disabled={busy} spellCheck={false} onChange={e => setDraft(s => ({ ...s, model: e.target.value }))} /></label>
      <label className={styles.field}>Reasoning effort<select value={draft.effort} disabled={busy} onChange={e => setDraft(s => ({ ...s, effort: e.target.value as AiSettings['effort'] }))}>{['none', 'low', 'medium', 'high'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={close}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  </dialog>
}
