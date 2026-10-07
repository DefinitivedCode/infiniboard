export type IconName = 'select' | 'hand' | 'text' | 'sticky' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'pen' | 'undo' | 'redo' | 'grid' | 'sun' | 'moon' | 'help' | 'minus' | 'plus' | 'fit' | 'trash' | 'close' | 'copy' | 'file' | 'export' | 'import' | 'branch'

const paths: Record<IconName, string> = {
  select: 'M5 3l14 10-7 1-3 7-4-18Z', hand: 'M8 12V6a2 2 0 0 1 4 0v5-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v8c0 4-3 6-7 6-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z',
  text: 'M4 5h16M12 5v15M8 20h8', sticky: 'M4 4h16v11l-5 5H4V4ZM15 20v-5h5',
  rect: 'M4 5h16v14H4Z', ellipse: 'M20 12a8 7 0 1 1-16 0 8 7 0 1 1 16 0',
  line: 'M5 19 19 5', arrow: 'M5 19 19 5M9 5h10v10', pen: 'm4 20 4-1L20 7l-3-3L5 16l-1 4ZM14 7l3 3',
  undo: 'M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12', redo: 'm16 5 5 5-5 5M21 10H10a6 6 0 0 0 0 12',
  grid: 'M4 8h16M4 16h16M8 4v16M16 4v16', sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z', help: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17v.1',
  minus: 'M5 12h14', plus: 'M5 12h14M12 5v14', fit: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7', close: 'm6 6 12 12M18 6 6 18', copy: 'M8 8h12v12H8ZM16 8V4H4v12h4',
  file: 'M5 3h9l5 5v13H5ZM14 3v5h5M8 12h8M8 16h8',
  export: 'M4 15v5h16v-5M12 16V3M7 8l5-5 5 5', import: 'M4 15v5h16v-5M12 3v13M7 11l5 5 5-5',
  branch: 'M4 10h6v4H4ZM16 3h4v4h-4ZM16 17h4v4h-4ZM10 12h3V5h3M13 12v7h3',
}

export function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
