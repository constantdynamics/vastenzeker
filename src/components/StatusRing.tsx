import { useRef, useState } from 'react'
import type { FastingStatus } from '../lib/time'
import { formatClock } from '../lib/time'

const COLORS: Record<string, string> = {
  eating: 'var(--status-green)',
  free: 'var(--status-green)',
  idle: 'var(--neon-purple)',
  fasting: 'var(--status-red)',
  unplanned: 'var(--text-faint)',
}

const MODE_KEY = 'vz_timer_mode_v1'
type CountMode = 'down' | 'up'

const R = 96
const SIZE = 220
const CIRC = 2 * Math.PI * R

/**
 * De timer is het bedieningspaneel zelf:
 * - tijdens het vasten kun je aan de ring DRAAIEN om de starttijd te
 *   finetunen (5-minutenstappen); loslaten slaat op via onScrubStart;
 * - tikken op de klok in het midden wisselt tussen aftellen (nog te gaan)
 *   en optellen (al bezig);
 * - het slotje linksonder zet het draaien uit, zodat scrollen over de ring
 *   nooit per ongeluk je starttijd verschuift (touch-action blijft dan
 *   gewoon scrollen).
 */
export default function StatusRing({
  status,
  onScrubStart,
  locked = false,
  onToggleLock,
}: {
  status: FastingStatus
  /** Alleen relevant bij een lopende vast: nieuwe starttijd na een ringdraai. */
  onScrubStart?: (newStart: Date) => void
  /** Slot dicht = draaien aan de ring uitgeschakeld. */
  locked?: boolean
  /** Zonder handler wordt er geen slotje getoond. */
  onToggleLock?: () => void
}) {
  const [mode, setMode] = useState<CountMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'up' ? 'up' : 'down'
    } catch {
      return 'down'
    }
  })
  const [scrubFrac, setScrubFrac] = useState<number | null>(null)
  const scrubbing = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const color = COLORS[status.kind]
  const draggable = status.kind === 'fasting' && Boolean(onScrubStart) && !locked
  const totalMs = Math.max(1, status.totalMs)

  const progress = Math.min(1, Math.max(0, scrubFrac ?? status.progress))
  const elapsedMs = scrubFrac !== null ? scrubFrac * totalMs : status.elapsedMs
  const remainingMs = scrubFrac !== null ? totalMs - elapsedMs : status.msToChange

  function toggleMode() {
    const next: CountMode = mode === 'down' ? 'up' : 'down'
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // opslag geblokkeerd: de keuze geldt dan alleen deze sessie
    }
  }

  // Hoekpositie op de ring → fractie van de vast. Alleen aanrakingen op of
  // vlak naast de ring tellen, zodat het midden een gewone klik blijft.
  function fracFromEvent(e: { clientX: number; clientY: number }): number | null {
    const el = wrapRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const scale = rect.width / SIZE
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const dist = Math.hypot(dx, dy)
    if (dist < (R - 32) * scale || dist > (R + 36) * scale) return null
    let ang = Math.atan2(dy, dx) + Math.PI / 2 // 12 uur = 0, met de klok mee
    if (ang < 0) ang += 2 * Math.PI
    return ang / (2 * Math.PI)
  }

  // Snappen op 5 minuten: finetunen zonder gepriegel.
  function snap(frac: number): number {
    const step = 5 * 60000
    const ms = Math.round((frac * totalMs) / step) * step
    return Math.min(0.999, Math.max(0, ms / totalMs))
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggable) return
    const f = fracFromEvent(e)
    if (f === null) return
    scrubbing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    setScrubFrac(snap(f))
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!scrubbing.current) return
    const f = fracFromEvent(e)
    if (f !== null) setScrubFrac(snap(f))
  }

  function onPointerEnd() {
    if (!scrubbing.current) return
    scrubbing.current = false
    setScrubFrac((f) => {
      if (f !== null && onScrubStart) onScrubStart(new Date(Date.now() - f * totalMs))
      return null
    })
  }

  // Greep op het uiteinde van de voortgangsboog. De hele svg is via CSS −90°
  // gedraaid (boog start bovenaan), dus hier rekenen we in óngedraaide
  // svg-coördinaten: 0 rad = drie uur.
  const handleAngle = progress * 2 * Math.PI
  const hx = SIZE / 2 + R * Math.cos(handleAngle)
  const hy = SIZE / 2 + R * Math.sin(handleAngle)
  const showHandle = draggable

  const showClock = status.kind === 'fasting' || status.kind === 'eating' || status.kind === 'idle'
  const canToggle = status.kind === 'fasting' || status.kind === 'eating'

  let centerLabel: string
  let centerMs: number
  switch (status.kind) {
    case 'fasting':
      centerLabel = mode === 'up' ? 'al bezig' : 'nog te gaan'
      centerMs = mode === 'up' ? elapsedMs : remainingMs
      break
    case 'eating':
      centerLabel = mode === 'up' ? 'venster open sinds' : 'venster sluit over'
      centerMs = mode === 'up' ? status.elapsedMs : status.msToChange
      break
    case 'idle':
      centerLabel = 'venster opent over'
      centerMs = status.msToChange
      break
    case 'free':
      centerLabel = 'vrije dag'
      centerMs = 0
      break
    default:
      centerLabel = ''
      centerMs = 0
  }

  return (
    <div
      ref={wrapRef}
      className={`ring-wrap ${draggable ? 'scrub' : ''} ${scrubFrac !== null ? 'scrubbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {/* role op de svg, niet op de wrapper: anders is de klok-knop
          onbereikbaar voor screenreaders */}
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel(status, locked)}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - progress)}
          style={{
            filter: `drop-shadow(0 0 8px ${color})`,
            // tijdens het draaien geen animatie: de ring moet aan je vinger plakken
            transition: scrubFrac !== null ? 'none' : 'stroke-dashoffset 1s linear',
          }}
        />
        {showHandle && (
          <circle
            cx={hx}
            cy={hy}
            r={scrubFrac !== null ? 13 : 10}
            fill="var(--bg-card)"
            stroke={color}
            strokeWidth="3"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}
      </svg>
      <div className="ring-center">
        {canToggle ? (
          <button
            className="ring-center-btn"
            onClick={toggleMode}
            aria-label={
              mode === 'down'
                ? 'Timer telt af — tik om op te tellen'
                : 'Timer telt op — tik om af te tellen'
            }
          >
            <span className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {centerLabel}
            </span>
            <span className="status-timer">{formatClock(centerMs)}</span>
            <span className="ring-mode-hint" aria-hidden>
              {mode === 'down' ? '▼ aftellen' : '▲ optellen'}
            </span>
          </button>
        ) : (
          <>
            <span className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {centerLabel}
            </span>
            <span className="status-timer">{showClock ? formatClock(centerMs) : '—'}</span>
          </>
        )}
      </div>
      {onToggleLock && (
        <button
          className={`ring-lock ${locked ? 'on' : ''}`}
          onClick={onToggleLock}
          // niet laten doorbubbelen: een tik op het slotje mag nooit zelf
          // een ringdraai starten (de knop ligt binnen de ringzone)
          onPointerDown={(e) => e.stopPropagation()}
          aria-pressed={locked}
          aria-label={
            locked
              ? 'Ring vergrendeld — tik om draaien mogelijk te maken'
              : 'Ring ontgrendeld — tik om draaien te blokkeren'
          }
          title={locked ? 'Slot eraf halen' : 'Ring op slot zetten'}
        >
          {locked ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 7.5-2" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}

function ariaLabel(status: FastingStatus, locked: boolean): string {
  switch (status.kind) {
    case 'fasting':
      return locked
        ? `Je vast nu, nog ${formatClock(status.msToChange)} te gaan. De ring is vergrendeld.`
        : `Je vast nu, nog ${formatClock(status.msToChange)} te gaan. Draai aan de ring om je starttijd aan te passen.`
    case 'eating':
      return `Eetvenster open, sluit over ${formatClock(status.msToChange)}`
    case 'idle':
      return `Vast nog niet gestart, venster opent over ${formatClock(status.msToChange)}`
    case 'free':
      return 'Vrije dag, geen vast gepland'
    default:
      return 'Geen schema ingesteld'
  }
}
