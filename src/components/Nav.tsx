export type Tab = 'home' | 'schema' | 'hartjes' | 'meten' | 'meer'

const items: { key: Tab; label: string; color: string; icon: JSX.Element }[] = [
  {
    key: 'home',
    label: 'Nu',
    color: 'var(--neon-cyan)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    key: 'schema',
    label: 'Schema',
    color: 'var(--neon-purple)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    key: 'hartjes',
    label: 'Hartjes',
    color: 'var(--neon-magenta)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 21C6 16 3 12.5 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 3.5-3 7-9 12z" />
      </svg>
    ),
  },
  {
    key: 'meten',
    label: 'Meten',
    color: 'var(--neon-lime)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 17l5-6 4 3 6-8" />
        <path d="M3 21h18" />
      </svg>
    ),
  },
  {
    key: 'meer',
    label: 'Meer',
    color: 'var(--neon-orange)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export default function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="nav" aria-label="Hoofdnavigatie">
      <div className="nav-brand" aria-hidden>
        Zip Your Lip
      </div>
      {items.map((it) => (
        <button
          key={it.key}
          className={tab === it.key ? 'on' : ''}
          style={{ ['--nav-color' as string]: it.color }}
          onClick={() => onChange(it.key)}
          aria-current={tab === it.key ? 'page' : undefined}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </nav>
  )
}
