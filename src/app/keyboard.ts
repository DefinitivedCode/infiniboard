// Canvas commands yield to typing, composition, modal dialogs, and native button activation.
export function ignoreShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return true
  const target = event.target instanceof Element ? event.target : null
  const focused = document.activeElement
  const typing = 'input, textarea, select, [contenteditable], [role="textbox"]'
  if (target?.closest(typing) || focused?.closest(typing)) return true
  const button = 'button, a, [role="button"]'
  return !!(target?.closest(button) || focused?.closest(button)) && (event.code === 'Space' || event.key === 'Enter')
}
