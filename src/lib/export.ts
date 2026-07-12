import { supabase } from './supabase'

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function fetchAll(userId: string) {
  const [profile, schedule, fasts, measurements, favorites, reads] = await Promise.all([
    supabase.from('if_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('if_schedule').select('*').eq('user_id', userId).order('weekday'),
    supabase.from('if_fasts').select('*').eq('user_id', userId).order('day'),
    supabase.from('if_measurements').select('*').eq('user_id', userId).order('measured_on'),
    supabase
      .from('if_tip_favorites')
      .select('tip_id, created_at, if_tips(slug, title, category)')
      .eq('user_id', userId),
    supabase.from('if_tip_reads').select('tip_id, context, times_shown, last_shown_at').eq('user_id', userId),
  ])
  return {
    exported_at: new Date().toISOString(),
    app: 'Vast en Zeker',
    profile: profile.data,
    schedule: schedule.data,
    fasts: fasts.data,
    measurements: measurements.data,
    favorites: favorites.data,
    tip_reads: reads.data,
  }
}

export async function exportJson(userId: string) {
  const data = await fetchAll(userId)
  download(
    `vast-en-zeker-export-${data.exported_at.slice(0, 10)}.json`,
    'application/json',
    JSON.stringify(data, null, 2),
  )
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => escape(r[c])).join(';'))].join('\n')
}

export async function exportCsv(userId: string) {
  const data = await fetchAll(userId)
  const stamp = data.exported_at.slice(0, 10)
  const fasts = (data.fasts ?? []) as Record<string, unknown>[]
  const measurements = (data.measurements ?? []) as Record<string, unknown>[]
  if (fasts.length > 0) download(`vast-en-zeker-dagen-${stamp}.csv`, 'text/csv', toCsv(fasts))
  if (measurements.length > 0)
    download(`vast-en-zeker-gewicht-${stamp}.csv`, 'text/csv', toCsv(measurements))
  if (fasts.length === 0 && measurements.length === 0)
    download(`vast-en-zeker-leeg-${stamp}.csv`, 'text/csv', 'nog geen data')
}
