import { useMemo, useState } from 'react'
import { useAppData } from '../App'
import { computeStreak } from '../lib/streak'
import { dateKey } from '../lib/time'
import type { Measurement } from '../lib/types'

export default function TrackView() {
  const { fasts, measurements, profile, schedule, addMeasurement, upsertToday } = useAppData()

  const today = dateKey(new Date())
  const todayFast = fasts.find((f) => f.day === today)
  const streak = useMemo(() => computeStreak(fasts, profile, schedule), [fasts, profile, schedule])

  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault()
    const kg = parseFloat(weight.replace(',', '.'))
    if (isNaN(kg) || kg < 30 || kg > 300) return
    setSaving(true)
    await addMeasurement(today, Math.round(kg * 10) / 10)
    setWeight('')
    setSaving(false)
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2>Vandaag</h2>
      <div className="two-col">
      <div className="card stack">
        <p className="muted small">Hoe ging het vasten vandaag?</p>
        <div className="chips">
          {(
            [
              ['completed', 'Gehaald', 'var(--status-green)'],
              ['broken', 'Gebroken', 'var(--neon-orange)'],
              ['skipped', 'Overgeslagen', 'var(--text-faint)'],
            ] as const
          ).map(([status, label, color]) => (
            <button
              key={status}
              className={`chip ${todayFast?.status === status ? 'on' : ''}`}
              style={{ ['--chip-color' as string]: color }}
              onClick={() => upsertToday({ status })}
            >
              {label}
            </button>
          ))}
        </div>
        {todayFast?.status === 'broken' && (
          <p className="faint">
            Eén gebroken dag stelt op maandniveau niets voor. Morgen staat de teller gewoon weer
            aan.
          </p>
        )}
      </div>

      <div className="card stack">
        <p className="muted small">Hoe voelde het? (drie tikken, meer niet)</p>
        <FeelScale
          label="Energie"
          color="var(--neon-lime)"
          value={todayFast?.energy ?? null}
          onSet={(v) => upsertToday({ energy: v })}
        />
        <FeelScale
          label="Honger"
          color="var(--neon-orange)"
          value={todayFast?.hunger ?? null}
          onSet={(v) => upsertToday({ hunger: v })}
        />
        <FeelScale
          label="Focus"
          color="var(--neon-cyan)"
          value={todayFast?.focus ?? null}
          onSet={(v) => upsertToday({ focus: v })}
        />
      </div>
      </div>

      <h2>Reeks</h2>
      <div className="card row">
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--neon-lime)' }}>
            {streak.current}
          </div>
          <div className="stat-label">dagen op rij</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--neon-cyan)' }}>
            {streak.best}
          </div>
          <div className="stat-label">beste reeks</div>
        </div>
      </div>
      <p className="faint">
        Een reeks is een hulpmiddel, geen doel. Een gebroken reeks is geen ramp — en doorgaan
        terwijl je je beroerd voelt om een getal te redden is precies verkeerd om.
      </p>

      <h2>Gewicht</h2>
      <form className="card row" onSubmit={saveWeight} style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="weight">Vandaag (kg)</label>
          <input
            id="weight"
            inputMode="decimal"
            placeholder="bijv. 86,4"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" style={{ flex: '0 0 auto' }} disabled={saving} type="submit">
          Opslaan
        </button>
      </form>

      {measurements.length >= 2 ? (
        <WeightChart measurements={measurements} />
      ) : (
        <p className="faint">
          Vanaf twee metingen zie je hier een grafiek. Wegen hoeft niet dagelijks; één vast moment
          per week zegt genoeg.
        </p>
      )}

      {measurements.length > 0 && (
        <div className="card stack" style={{ gap: 6 }}>
          <p className="muted small" style={{ fontWeight: 700 }}>
            Laatste metingen
          </p>
          {[...measurements]
            .slice(-8)
            .reverse()
            .map((m) => (
              <div className="spread small" key={m.id}>
                <span className="muted">
                  {new Date(m.measured_on + 'T00:00').toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span>{Number(m.weight_kg).toFixed(1)} kg</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function FeelScale({
  label,
  color,
  value,
  onSet,
}: {
  label: string
  color: string
  value: number | null
  onSet: (v: number) => void
}) {
  return (
    <div className="scale-row">
      <span className="small">{label}</span>
      <div className="scale-buttons" role="radiogroup" aria-label={label}>
        {[1, 2, 3].map((v) => (
          <button
            key={v}
            className={`scale-btn ${value === v ? 'on' : ''}`}
            style={{ ['--scale-color' as string]: color }}
            onClick={() => onSet(v)}
            role="radio"
            aria-checked={value === v}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Eén serie op donkere ondergrond: één kleur, dunne lijn, terughoudend grid,
 * tooltip bij aanraken, en direct label op de laatste waarde.
 */
function WeightChart({ measurements }: { measurements: Measurement[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const W = 480
  const H = 220
  const PAD = { top: 16, right: 56, bottom: 28, left: 40 }

  const points = useMemo(() => {
    const sorted = [...measurements].sort((a, b) => (a.measured_on < b.measured_on ? -1 : 1))
    const xs = sorted.map((m) => new Date(m.measured_on + 'T00:00').getTime())
    const ys = sorted.map((m) => Number(m.weight_kg))
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMin = Math.floor(Math.min(...ys) - 1)
    const yMax = Math.ceil(Math.max(...ys) + 1)
    const sx = (x: number) =>
      PAD.left + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - PAD.left - PAD.right)
    const sy = (y: number) => PAD.top + (1 - (y - yMin) / Math.max(1, yMax - yMin)) * (H - PAD.top - PAD.bottom)
    return {
      sorted,
      coords: sorted.map((m, i) => ({ x: sx(xs[i]), y: sy(ys[i]), m })),
      yMin,
      yMax,
      sy,
    }
  }, [measurements])

  const path = points.coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = points.coords[points.coords.length - 1]
  const gridLines = [points.yMin, (points.yMin + points.yMax) / 2, points.yMax]

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0
    let bestD = Infinity
    points.coords.forEach((p, i) => {
      const d = Math.abs(p.x - x)
      if (d < bestD) {
        bestD = d
        nearest = i
      }
    })
    setHover(nearest)
  }

  const hovered = hover !== null ? points.coords[hover] : null

  return (
    <div className="card chart-wrap">
      <p className="muted small" style={{ fontWeight: 700, marginBottom: 8 }}>
        Gewicht (kg)
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Gewichtsverloop van ${points.sorted.length} metingen, laatste ${Number(last.m.weight_kg).toFixed(1)} kilo`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={points.sy(g)}
              y2={points.sy(g)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={points.sy(g) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">
              {g.toFixed(0)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--neon-cyan)" strokeWidth="2" strokeLinejoin="round" />
        {points.coords.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 6 : 3.5}
            fill="var(--neon-cyan)"
            stroke="var(--bg-card)"
            strokeWidth="2"
          />
        ))}
        <text x={last.x + 8} y={last.y + 4} fontSize="12" fontWeight="700" fill="var(--text)">
          {Number(last.m.weight_kg).toFixed(1)}
        </text>
        {hovered && (
          <g>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--text-faint)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <g
              transform={`translate(${Math.min(W - PAD.right - 110, Math.max(PAD.left, hovered.x - 55))}, ${PAD.top})`}
            >
              <rect width="110" height="36" rx="8" fill="var(--bg-raised)" stroke="var(--border)" />
              <text x="55" y="15" textAnchor="middle" fontSize="11" fill="var(--text-dim)">
                {new Date(hovered.m.measured_on + 'T00:00').toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                })}
              </text>
              <text x="55" y="29" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">
                {Number(hovered.m.weight_kg).toFixed(1)} kg
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}
