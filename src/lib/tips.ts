import { supabase } from './supabase'
import type { Phase, Tip, TipRead } from './types'

const TIPS_CACHE_KEY = 'vz_tips_v1'

/** Haalt alle tips op; cachet in localStorage zodat de app offline iets te vertellen heeft. */
export async function loadTips(): Promise<Tip[]> {
  try {
    const { data, error } = await supabase
      .from('if_tips')
      .select('*')
      .order('id')
    if (error) throw error
    if (data && data.length > 0) {
      localStorage.setItem(TIPS_CACHE_KEY, JSON.stringify(data))
      return data as Tip[]
    }
  } catch {
    // offline of fout: val terug op cache
  }
  const cached = localStorage.getItem(TIPS_CACHE_KEY)
  return cached ? (JSON.parse(cached) as Tip[]) : []
}

export async function loadReads(userId: string): Promise<TipRead[]> {
  const { data } = await supabase
    .from('if_tip_reads')
    .select('tip_id, context, times_shown, last_shown_at')
    .eq('user_id', userId)
  return (data as TipRead[]) ?? []
}

export interface TipContext {
  phase: Phase
  sportDay: boolean
  heavy: boolean
}

/**
 * Rotatie: eerst ongeziene tips die bij de context passen, dan ongeziene
 * tips in het algemeen, en pas als alles gezien is de minst/langst geleden
 * getoonde. Binnen een groep wordt willekeurig gekozen voor variatie.
 */
export function pickTip(
  tips: Tip[],
  reads: TipRead[],
  ctx: TipContext,
  excludeIds: number[] = [],
): Tip | null {
  const context = ctx.heavy ? 'heavy' : 'tip'
  const readMap = new Map(
    reads.filter((r) => r.context === context).map((r) => [r.tip_id, r]),
  )
  const pool = tips.filter(
    (t) =>
      (ctx.heavy ? t.heavy : true) &&
      !excludeIds.includes(t.id) &&
      (t.sport_day === null || t.sport_day === undefined || t.sport_day === ctx.sportDay),
  )
  if (pool.length === 0) return null

  const matchesPhase = (t: Tip) =>
    t.phases.includes('any') || t.phases.includes(ctx.phase)

  const unseenInContext = pool.filter((t) => !readMap.has(t.id) && matchesPhase(t))
  const unseenAny = pool.filter((t) => !readMap.has(t.id))

  const randomFrom = (arr: Tip[]) => arr[Math.floor(Math.random() * arr.length)]

  if (unseenInContext.length > 0) return randomFrom(unseenInContext)
  if (unseenAny.length > 0) return randomFrom(unseenAny)

  // Alles is gezien: herhaal, maar eerlijk gespreid.
  const scored = [...pool].sort((a, b) => {
    const ra = readMap.get(a.id)
    const rb = readMap.get(b.id)
    const shownDiff = (ra?.times_shown ?? 0) - (rb?.times_shown ?? 0)
    if (shownDiff !== 0) return shownDiff
    return (
      new Date(ra?.last_shown_at ?? 0).getTime() -
      new Date(rb?.last_shown_at ?? 0).getTime()
    )
  })
  const leastShown = scored.filter(
    (t) => (readMap.get(t.id)?.times_shown ?? 0) === (readMap.get(scored[0].id)?.times_shown ?? 0),
  )
  const phaseFirst = leastShown.filter(matchesPhase)
  return randomFrom(phaseFirst.length > 0 ? phaseFirst : leastShown)
}

export async function recordShown(userId: string, tipId: number, heavy: boolean): Promise<void> {
  const context = heavy ? 'heavy' : 'tip'
  const { data } = await supabase
    .from('if_tip_reads')
    .select('times_shown')
    .eq('user_id', userId)
    .eq('tip_id', tipId)
    .eq('context', context)
    .maybeSingle()
  await supabase.from('if_tip_reads').upsert({
    user_id: userId,
    tip_id: tipId,
    context,
    times_shown: (data?.times_shown ?? 0) + 1,
    last_shown_at: new Date().toISOString(),
  })
}
