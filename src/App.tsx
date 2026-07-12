import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { loadTips, loadReads, recordShown } from './lib/tips'
import { dateKey } from './lib/time'
import type {
  FastDay,
  Measurement,
  Profile,
  ScheduleDay,
  Tip,
  TipRead,
} from './lib/types'
import AuthView from './views/AuthView'
import Onboarding from './views/Onboarding'
import Home from './views/Home'
import ScheduleView from './views/ScheduleView'
import Favorites from './views/Favorites'
import TrackView from './views/TrackView'
import SettingsView from './views/SettingsView'
import Nav, { type Tab } from './components/Nav'

export interface AppData {
  userId: string
  profile: Profile
  schedule: ScheduleDay[]
  tips: Tip[]
  reads: TipRead[]
  favorites: Set<number>
  fasts: FastDay[]
  measurements: Measurement[]
  refresh: () => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  saveScheduleDay: (day: ScheduleDay) => Promise<void>
  toggleFavorite: (tipId: number) => Promise<void>
  upsertToday: (patch: Partial<FastDay>) => Promise<void>
  addMeasurement: (measuredOn: string, weightKg: number) => Promise<void>
  markRead: (tipId: number, heavy: boolean) => void
}

const DataContext = createContext<AppData | null>(null)

export function useAppData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData buiten provider')
  return ctx
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!authReady) return <Splash />
  if (!session) return <AuthView />
  return <AuthedApp userId={session.user.id} />
}

function Splash() {
  return (
    <main className="app-main" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="logo">Vast en Zeker</div>
    </main>
  )
}

function AuthedApp({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null | 'loading'>('loading')
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [reads, setReads] = useState<TipRead[]>([])
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [fasts, setFasts] = useState<FastDay[]>([])
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [tab, setTab] = useState<Tab>('home')

  const refresh = useCallback(async () => {
    const [p, s, t, r, f, fa, m] = await Promise.all([
      supabase.from('if_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('if_schedule').select('*').eq('user_id', userId).order('weekday'),
      loadTips(),
      loadReads(userId),
      supabase.from('if_tip_favorites').select('tip_id').eq('user_id', userId),
      supabase.from('if_fasts').select('*').eq('user_id', userId).order('day', { ascending: false }).limit(120),
      supabase.from('if_measurements').select('*').eq('user_id', userId).order('measured_on'),
    ])
    setProfile((p.data as Profile) ?? null)
    setSchedule((s.data as ScheduleDay[]) ?? [])
    setTips(t)
    setReads(r)
    setFavorites(new Set(((f.data as { tip_id: number }[]) ?? []).map((x) => x.tip_id)))
    setFasts((fa.data as FastDay[]) ?? [])
    setMeasurements((m.data as Measurement[]) ?? [])
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const { data, error } = await supabase
        .from('if_profiles')
        .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
        .select()
        .single()
      if (!error && data) setProfile(data as Profile)
    },
    [userId],
  )

  const saveScheduleDay = useCallback(
    async (day: ScheduleDay) => {
      const row = { ...day, user_id: userId }
      const { error } = await supabase
        .from('if_schedule')
        .upsert(row, { onConflict: 'user_id,weekday' })
      if (!error) {
        setSchedule((prev) => {
          const rest = prev.filter((d) => d.weekday !== day.weekday)
          return [...rest, row].sort((a, b) => a.weekday - b.weekday)
        })
      }
    },
    [userId],
  )

  const toggleFavorite = useCallback(
    async (tipId: number) => {
      const isFav = favorites.has(tipId)
      // Optimistisch bijwerken; server volgt
      setFavorites((prev) => {
        const next = new Set(prev)
        if (isFav) next.delete(tipId)
        else next.add(tipId)
        return next
      })
      if (isFav) {
        await supabase.from('if_tip_favorites').delete().eq('user_id', userId).eq('tip_id', tipId)
      } else {
        await supabase.from('if_tip_favorites').upsert({ user_id: userId, tip_id: tipId })
      }
    },
    [userId, favorites],
  )

  const upsertToday = useCallback(
    async (patch: Partial<FastDay>) => {
      const today = dateKey(new Date())
      const existing = fasts.find((f) => f.day === today)
      const row = { user_id: userId, day: today, ...patch }
      const { data, error } = await supabase
        .from('if_fasts')
        .upsert(existing ? { ...row, id: existing.id } : row, { onConflict: 'user_id,day' })
        .select()
        .single()
      if (!error && data) {
        setFasts((prev) => {
          const rest = prev.filter((f) => f.day !== today)
          return [data as FastDay, ...rest]
        })
      }
    },
    [userId, fasts],
  )

  const addMeasurement = useCallback(
    async (measuredOn: string, weightKg: number) => {
      const { data, error } = await supabase
        .from('if_measurements')
        .upsert(
          { user_id: userId, measured_on: measuredOn, weight_kg: weightKg },
          { onConflict: 'user_id,measured_on' },
        )
        .select()
        .single()
      if (!error && data) {
        setMeasurements((prev) => {
          const rest = prev.filter((m) => m.measured_on !== measuredOn)
          return [...rest, data as Measurement].sort((a, b) =>
            a.measured_on < b.measured_on ? -1 : 1,
          )
        })
      }
    },
    [userId],
  )

  const markRead = useCallback(
    (tipId: number, heavy: boolean) => {
      const context = heavy ? 'heavy' : 'tip'
      setReads((prev) => {
        const existing = prev.find((r) => r.tip_id === tipId && r.context === context)
        if (existing) {
          return prev.map((r) =>
            r.tip_id === tipId && r.context === context
              ? { ...r, times_shown: r.times_shown + 1, last_shown_at: new Date().toISOString() }
              : r,
          )
        }
        return [
          ...prev,
          { tip_id: tipId, context, times_shown: 1, last_shown_at: new Date().toISOString() },
        ]
      })
      // fire-and-forget naar de server
      recordShown(userId, tipId, heavy)
    },
    [userId],
  )

  if (profile === 'loading') return <Splash />

  const data: AppData = {
    userId,
    profile: (profile as Profile) ?? emptyProfile(userId),
    schedule,
    tips,
    reads,
    favorites,
    fasts,
    measurements,
    refresh,
    updateProfile,
    saveScheduleDay,
    toggleFavorite,
    upsertToday,
    addMeasurement,
    markRead,
  }

  const needsOnboarding = !profile || !profile.onboarded_at

  return (
    <DataContext.Provider value={data}>
      {needsOnboarding ? (
        <Onboarding />
      ) : (
        <>
          <main className="app-main">
            {tab === 'home' && <Home />}
            {tab === 'schema' && <ScheduleView />}
            {tab === 'hartjes' && <Favorites />}
            {tab === 'meten' && <TrackView />}
            {tab === 'meer' && <SettingsView />}
          </main>
          <Nav tab={tab} onChange={setTab} />
        </>
      )}
    </DataContext.Provider>
  )
}

function emptyProfile(userId: string): Profile {
  return {
    user_id: userId,
    display_name: null,
    experience: null,
    goal: null,
    family: null,
    work_rhythm: null,
    medical_flags: [],
    medical_ack: false,
    disclaimer_accepted_at: null,
    onboarded_at: null,
    protocol: '16:8',
    window_start: '12:00:00',
    window_end: '20:00:00',
    buildup_weeks: 0,
  }
}
