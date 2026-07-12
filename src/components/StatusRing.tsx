import type { FastingStatus } from '../lib/time'
import { formatClock } from '../lib/time'

const COLORS: Record<string, string> = {
  eating: 'var(--status-green)',
  free: 'var(--status-green)',
  fasting: 'var(--status-red)',
  unplanned: 'var(--text-faint)',
}

export default function StatusRing({ status }: { status: FastingStatus }) {
  const r = 96
  const c = 2 * Math.PI * r
  const progress = Math.min(1, Math.max(0, status.progress))
  const color = COLORS[status.kind]

  return (
    <div className="ring-wrap" role="img" aria-label={ariaLabel(status)}>
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="110"
          cy="110"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="ring-center">
        <span className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {status.kind === 'fasting' ? 'nog te gaan' : status.kind === 'eating' ? 'venster sluit over' : ''}
        </span>
        <span className="status-timer">
          {status.kind === 'unplanned' ? '—' : formatClock(status.msToChange)}
        </span>
      </div>
    </div>
  )
}

function ariaLabel(status: FastingStatus): string {
  switch (status.kind) {
    case 'eating':
      return `Eetvenster open, sluit over ${formatClock(status.msToChange)}`
    case 'fasting':
      return `Je vast nu, nog ${formatClock(status.msToChange)} te gaan`
    case 'free':
      return 'Vrije dag, geen vastenvenster'
    default:
      return 'Geen schema ingesteld'
  }
}
