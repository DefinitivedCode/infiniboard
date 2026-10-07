import { useEffect, useRef, useState } from 'react'
import { Icon } from '../app/Icon'
import { useProject } from '../store/useProject'
import { graphContext } from './context'
import styles from '../app/App.module.css'

export function GraphContext() {
  const [text, setText] = useState<string | null>(null)
  return <>
    <button className={styles.organizeButton} title="View graph as text" onClick={() => setText(graphContext(useProject.getState().project))}><Icon name="file" /><span>Context</span></button>
    {text !== null && <ContextDialog text={text} close={() => setText(null)} />}
  </>
}

function ContextDialog({ text, close }: { text: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [feedback, setFeedback] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setFeedback('Copied') }
    catch { field.current?.focus(); field.current?.select(); setFeedback('Press Ctrl/Cmd + C to copy the selected text.') }
  }
  return <dialog ref={dialog} className={styles.contextDialog} aria-labelledby="graph-context-title" onCancel={close} onKeyDown={event => event.stopPropagation()}>
    <div className={styles.dialogHeading}><h2 id="graph-context-title">Graph context</h2><button className={styles.iconButton} aria-label="Close graph context" onClick={close}><Icon name="close" /></button></div>
    <p>All nodes and connections as plain text. Generated entirely on this device.</p>
    <textarea ref={field} className={styles.contextText} aria-label="Graph context text" readOnly spellCheck={false} value={text} />
    <div className={styles.dialogActions}><span role="status">{feedback}</span><button onClick={() => { void copy() }}><Icon name="copy" />Copy</button><button onClick={close}>Close</button></div>
  </dialog>
}
