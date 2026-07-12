import { useMemo, useState } from 'react'
import { useAppData } from '../App'
import { scheduleAdvice, sportAdvice, windowAdvice } from '../lib/advice'
import { protocolName, windowLengthHours } from '../lib/time'
import { SPORT_LABELS, WEEKDAY_LABELS } from '../lib/types'
import type { ScheduleDay, SportType } from '../lib/types'

const PRESETS: { name: string; start: string; end: string }[] = [
  { name: '14:10', start: '10:00', end: '20:00' },
  { name: '16:8', start: '12:00', end: '20:00' },
  { name: '18:6', start: '12:00', end: '18:00' },
  { name: '20:4', start: '14:00', end: '18:00' },
  { name: 'OMAD', start: '17:00', end: '18:00' },
]

export default function ScheduleView() {
  const { profile, schedule, updateProfile, saveScheduleDay } = useAppData()
  const [saving, setSaving] = useState(false)

  const start = profile.window_start.slice(0, 5)
  const end = profile.window_end.slice(0, 5)

  const days: ScheduleDay[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, d) => {
      const existing = schedule.find((s) => s.weekday === d)
      return (
        existing ?? {
          user_id: profile.user_id,
          weekday: d,
          fasting: true,
          window_start: null,
          window_end: null,
          sport_type: null,
        }
      )
    })
  }, [schedule, profile.user_id])

  const winAdvice = useMemo(() => windowAdvice(start, end), [start, end])
  const schedAdvice = useMemo(() => scheduleAdvice(days, profile), [days, profile])

  async function setWindow(newStart: string, newEnd: string) {
    setSaving(true)
    await updateProfile({
      window_start: newStart,
      window_end: newEnd,
      protocol: protocolName(newStart, newEnd),
    })
    setSaving(false)
  }

  async function patchDay(day: ScheduleDay, patch: Partial<ScheduleDay>) {
    await saveScheduleDay({ ...day, ...patch })
  }

  const eatHours = windowLengthHours(start, end)

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2>Eetvenster</h2>

      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`chip ${protocolName(start, end) === p.name ? 'on' : ''}`}
            style={{ ['--chip-color' as string]: 'var(--neon-cyan)' }}
            onClick={() => setWindow(p.start, p.end)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="card stack">
        <div className="row">
          <div className="field">
            <label htmlFor="win-start">Venster opent</label>
            <input
              id="win-start"
              type="time"
              value={start}
              onChange={(e) => e.target.value && setWindow(e.target.value, end)}
            />
          </div>
          <div className="field">
            <label htmlFor="win-end">Venster sluit</label>
            <input
              id="win-end"
              type="time"
              value={end}
              onChange={(e) => e.target.value && setWindow(start, e.target.value)}
            />
          </div>
        </div>
        <p className="muted small">
          {Math.round(24 - eatHours)} uur vasten, {Math.round(eatHours)} uur eten (
          {protocolName(start, end)}){saving ? ' · opslaan…' : ''}
        </p>
      </div>

      {winAdvice.map((a, i) => (
        <div className={`advice ${a.level}`} key={i}>
          <span>{a.text}</span>
        </div>
      ))}

      <h2>Weekschema</h2>
      <p className="muted small">
        Vink aan op welke dagen je vast. Per dag kun je het venster en je sport aanpassen.
      </p>

      <div className="stack">
        {days.map((day) => (
          <DayEditor key={day.weekday} day={day} defaults={{ start, end }} onPatch={patchDay} />
        ))}
      </div>

      {schedAdvice.map((a, i) => (
        <div className={`advice ${a.level}`} key={i}>
          <span>{a.text}</span>
        </div>
      ))}

      <SportAdviceBlock days={days} />

      <div className="card stack">
        <h3 style={{ fontSize: 16 }}>Hoe lang hou je dit vol?</h3>
        <p className="muted small">
          Denk in blokken van 4 tot 6 weken. Daarna een lichtere week: minder dagen of een ruimer
          venster. Zo voorkom je sluipende vermoeidheid en blijft het ritme houdbaar. Merk je dat
          een blok zwaar blijft voelen, versoepel dan eerder.
        </p>
      </div>
    </div>
  )
}

function DayEditor({
  day,
  defaults,
  onPatch,
}: {
  day: ScheduleDay
  defaults: { start: string; end: string }
  onPatch: (day: ScheduleDay, patch: Partial<ScheduleDay>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sportOrder: (SportType | null)[] = [null, 'strength', 'endurance', 'intense', 'easy']

  return (
    <div className={`day-row ${day.fasting ? '' : 'free'}`} style={{ flexWrap: 'wrap' }}>
      <span className="day-label">{WEEKDAY_LABELS[day.weekday]}</span>
      <button
        className={`toggle ${day.fasting ? 'on' : ''}`}
        onClick={() => onPatch(day, { fasting: !day.fasting })}
        aria-label={`${WEEKDAY_LABELS[day.weekday]}: ${day.fasting ? 'vastendag' : 'vrije dag'}`}
        aria-pressed={day.fasting}
      />
      <span className="muted small" style={{ flex: 1 }}>
        {day.fasting
          ? `${(day.window_start ?? defaults.start).slice(0, 5)}–${(day.window_end ?? defaults.end).slice(0, 5)}`
          : 'vrij'}
        {day.sport_type ? ` · ${SPORT_LABELS[day.sport_type]}` : ''}
      </span>
      <button className="btn btn-ghost small" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="stack" style={{ width: '100%', marginTop: 8 }}>
          {day.fasting && (
            <div className="row">
              <input
                type="time"
                value={(day.window_start ?? defaults.start).slice(0, 5)}
                onChange={(e) => e.target.value && onPatch(day, { window_start: e.target.value })}
                aria-label="Venster opent op deze dag"
              />
              <input
                type="time"
                value={(day.window_end ?? defaults.end).slice(0, 5)}
                onChange={(e) => e.target.value && onPatch(day, { window_end: e.target.value })}
                aria-label="Venster sluit op deze dag"
              />
            </div>
          )}
          <div className="field">
            <label>Sport op deze dag</label>
            <div className="chips">
              {sportOrder.map((s) => (
                <button
                  key={s ?? 'geen'}
                  className={`chip ${day.sport_type === s ? 'on' : ''}`}
                  style={{ ['--chip-color' as string]: 'var(--neon-orange)' }}
                  onClick={() => onPatch(day, { sport_type: s })}
                >
                  {s ? SPORT_LABELS[s] : 'geen'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SportAdviceBlock({ days }: { days: ScheduleDay[] }) {
  const { profile } = useAppData()
  const sportDays = days.filter((d) => d.sport_type)
  if (sportDays.length === 0) return null
  return (
    <div className="stack">
      <h2>Sport en vasten</h2>
      {sportDays.map((d) => (
        <div className="card stack" key={d.weekday} style={{ gap: 8 }}>
          <strong className="small" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {WEEKDAY_LABELS[d.weekday]} · {SPORT_LABELS[d.sport_type!]}
          </strong>
          {sportAdvice(d.sport_type!, d, profile).map((a, i) => (
            <div className={`advice ${a.level}`} key={i}>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
