export type Experience = 'none' | 'some' | 'experienced'
export type Goal = 'weight' | 'energy' | 'health' | 'habit' | 'other'
export type Family = 'young_kids' | 'older_kids' | 'partner' | 'single' | 'other'
export type WorkRhythm = 'office' | 'home' | 'shifts' | 'irregular' | 'other'
export type SportType = 'strength' | 'endurance' | 'intense' | 'easy'
export type FastStatus = 'planned' | 'active' | 'completed' | 'broken' | 'skipped'
export type TipCategory =
  | 'fysiologie'
  | 'gezin'
  | 'praktisch'
  | 'mindset'
  | 'sport'
  | 'valkuilen'
  | 'perspectief'
export type Phase =
  | 'fast_early'
  | 'fast_mid'
  | 'fast_late'
  | 'eat_open'
  | 'eat_mid'
  | 'eat_close'
  | 'any'

export interface Profile {
  user_id: string
  display_name: string | null
  experience: Experience | null
  goal: Goal | null
  family: Family | null
  work_rhythm: WorkRhythm | null
  medical_flags: string[]
  medical_ack: boolean
  disclaimer_accepted_at: string | null
  onboarded_at: string | null
  protocol: string
  window_start: string // 'HH:MM:SS'
  window_end: string
  buildup_weeks: number
}

export interface ScheduleDay {
  user_id: string
  weekday: number // 0 = maandag .. 6 = zondag
  fasting: boolean
  window_start: string | null
  window_end: string | null
  sport_type: SportType | null
  sport_time: string | null // 'HH:MM:SS', hoe laat je ongeveer traint
  sport_end_time: string | null // 'HH:MM:SS', tot hoe laat — voor maaltijdtiming
}

export interface Tip {
  id: number
  slug: string
  category: TipCategory
  title: string
  body: string
  phases: Phase[]
  sport_day: boolean | null
  heavy: boolean
  action: string | null
  evidence: string | null
}

export interface TipRead {
  tip_id: number
  context: 'tip' | 'heavy'
  times_shown: number
  last_shown_at: string
}

export interface FastDay {
  id: string
  user_id: string
  day: string // 'YYYY-MM-DD'
  status: FastStatus
  window_start: string | null
  window_end: string | null
  started_at: string | null
  ended_at: string | null
  energy: number | null
  hunger: number | null
  focus: number | null
  heavy_presses: number
  note: string | null
  /** Waarom deze dag bewust is overgeslagen, bv. 'bad_night'. */
  skip_reason: string | null
}

export interface Measurement {
  id: string
  user_id: string
  measured_on: string
  weight_kg: number
}

export const CATEGORY_LABELS: Record<TipCategory, string> = {
  fysiologie: 'In je lijf',
  gezin: 'Gezin',
  praktisch: 'Praktisch',
  mindset: 'Mindset',
  sport: 'Sport',
  valkuilen: 'Valkuilen',
  perspectief: 'Perspectief',
}

export const CATEGORY_COLORS: Record<TipCategory, string> = {
  fysiologie: 'var(--neon-cyan)',
  gezin: 'var(--neon-magenta)',
  praktisch: 'var(--neon-lime)',
  mindset: 'var(--neon-purple)',
  sport: 'var(--neon-orange)',
  valkuilen: 'var(--neon-pink)',
  perspectief: 'var(--neon-teal)',
}

export const WEEKDAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
export const WEEKDAY_FULL = [
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
  'zondag',
]

export const SPORT_LABELS: Record<SportType, string> = {
  strength: 'kracht',
  endurance: 'duur',
  intense: 'intensief',
  easy: 'rustig',
}
