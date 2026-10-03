import { useState, type FormEvent } from 'react'
import { Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-yellow-400 text-brand-900">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div>
            <div className="font-bold text-slate-900">BOLT LOG CRM</div>
            <div className="text-xs text-slate-500">Giriş yapın</div>
          </div>
        </div>
        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="label">E-posta</label>
        <input className="input mb-3" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Şifre</label>
        <input className="input mb-5" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </form>
    </div>
  )
}
