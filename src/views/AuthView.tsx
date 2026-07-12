import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthView() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.href },
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Account aangemaakt. Check je mail om je adres te bevestigen, en log daarna hier in.')
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Er ging iets mis.'
      setError(
        msg.includes('Invalid login credentials')
          ? 'Onjuiste combinatie van e-mail en wachtwoord.'
          : msg.includes('already registered')
            ? 'Dit e-mailadres heeft al een account. Log in.'
            : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-main" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <div className="logo">Vast en Zeker</div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Intermittent fasting zonder gedoe. Eén blik en je weet of je mag eten. Een account
            zorgt dat je data op al je apparaten staat.
          </p>
        </div>

        <form className="card stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          {notice && <p className="ok-text">{notice}</p>}
          <button className="btn btn-primary btn-wide" disabled={busy} type="submit">
            {busy ? 'Bezig…' : mode === 'login' ? 'Inloggen' : 'Account aanmaken'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-wide small"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError('')
              setNotice('')
            }}
          >
            {mode === 'login' ? 'Nog geen account? Aanmaken' : 'Al een account? Inloggen'}
          </button>
        </form>

        <p className="faint">
          Geen medisch advies. Overleg met je huisarts bij twijfel, medicijngebruik of een
          aandoening.
        </p>
      </div>
    </main>
  )
}
