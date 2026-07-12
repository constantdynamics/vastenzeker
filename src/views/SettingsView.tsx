import { useState } from 'react'
import { useAppData } from '../App'
import { supabase } from '../lib/supabase'
import { exportCsv, exportJson } from '../lib/export'

export default function SettingsView() {
  const { userId, profile, updateProfile, refresh } = useAppData()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  async function wipeData() {
    setBusy('wipe')
    // Alleen eigen rijen; RLS dwingt dat ook af.
    await supabase.from('if_tip_reads').delete().eq('user_id', userId)
    await supabase.from('if_tip_favorites').delete().eq('user_id', userId)
    await supabase.from('if_fasts').delete().eq('user_id', userId)
    await supabase.from('if_measurements').delete().eq('user_id', userId)
    await supabase.from('if_schedule').delete().eq('user_id', userId)
    await supabase.from('if_profiles').delete().eq('user_id', userId)
    await refresh()
    setBusy(null)
    setConfirmWipe(false)
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2>Meer</h2>

      <div className="card stack">
        <div className="field">
          <label htmlFor="dname">Naam (optioneel)</label>
          <input
            id="dname"
            defaultValue={profile.display_name ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (profile.display_name ?? '')) updateProfile({ display_name: v || null })
            }}
            placeholder="Hoe mogen we je noemen?"
          />
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 16 }}>Jouw data</h3>
        <p className="muted small">
          Alles wat je invoert is van jou. Download het wanneer je wilt.
        </p>
        <div className="row">
          <button className="btn" disabled={busy !== null} onClick={() => run('json', () => exportJson(userId))}>
            {busy === 'json' ? 'Bezig…' : 'Export JSON'}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => run('csv', () => exportCsv(userId))}>
            {busy === 'csv' ? 'Bezig…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 16 }}>Disclaimer</h3>
        <p className="muted small">
          Vast en Zeker geeft geen medisch advies. Intermittent fasting is niet geschikt bij
          diabetes met medicatie, een (voorgeschiedenis van een) eetstoornis, zwangerschap of
          ondergewicht, en hoort bij medicijngebruik of aandoeningen alleen in overleg met een
          arts. Voel je je beroerd tijdens het vasten: stop. De app zal je daar nooit voor
          afstraffen.
        </p>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 16 }}>Account</h3>
        <button className="btn btn-wide" onClick={() => supabase.auth.signOut()}>
          Uitloggen
        </button>
        {!confirmWipe ? (
          <button className="btn btn-ghost btn-wide muted" onClick={() => setConfirmWipe(true)}>
            Al mijn data verwijderen
          </button>
        ) : (
          <div className="stack">
            <p className="error-text">
              Dit verwijdert je profiel, schema, logboek, metingen en favorieten definitief. Je
              account blijft bestaan; de app begint opnieuw met de intake.
            </p>
            <div className="row">
              <button className="btn btn-danger" disabled={busy === 'wipe'} onClick={wipeData}>
                {busy === 'wipe' ? 'Verwijderen…' : 'Ja, verwijder alles'}
              </button>
              <button className="btn" onClick={() => setConfirmWipe(false)}>
                Annuleren
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="faint" style={{ textAlign: 'center' }}>
        Vast en Zeker · geen notificaties, geen gezeur — alles staat hier als jij de app opent
      </p>
    </div>
  )
}
