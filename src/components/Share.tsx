import { useState } from 'react'
import type { FormEvent } from 'react'
import { copyText, useShare } from '../lib/session'
import { Icon } from './icons'
import { Logo } from './Home'

/* ------------------------------------------------------------------ */
/* Partager sur Internet (PC qui héberge)                              */
/* ------------------------------------------------------------------ */

export function InternetShare({ path, boardName }: { path: string; boardName?: string }) {
  const { state, start, stop, newCode } = useShare(true)
  const [copied, setCopied] = useState<'link' | 'invite' | null>(null)
  const link = state.url ? state.url + path : ''

  const copy = async (what: 'link' | 'invite') => {
    await copyText(
      what === 'link'
        ? link
        : `Rejoins ${boardName ? `le board « ${boardName} »` : 'mon Postri'} : ${link}\nCode d’accès : ${state.code}`,
    )
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }

  if (state.status === 'on' && state.url && state.code) {
    return (
      <div className="netshare is-on">
        <p className="netshare-status">
          <i /> Partagé sur Internet
        </p>
        <label className="netshare-field">
          <span>Lien public</span>
          <span className="share-row">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn ghost small" onClick={() => copy('link')}>
              {copied === 'link' ? 'Copié' : 'Copier'}
            </button>
          </span>
        </label>
        <div className="netshare-field">
          <span>Code d’accès des invités</span>
          <span className="netshare-code-row">
            <strong className="netshare-code">{state.code}</strong>
            <button className="btn ghost small" onClick={newCode} title="Les invités déjà connectés devront saisir le nouveau code">
              Nouveau code
            </button>
          </span>
        </div>
        <div className="netshare-actions">
          <button className="btn primary small" onClick={() => copy('invite')}>
            {copied === 'invite' ? (
              <>
                <Icon.Check /> Invitation copiée
              </>
            ) : (
              'Copier l’invitation'
            )}
          </button>
          <button className="btn ghost small" onClick={stop}>
            Arrêter le partage
          </button>
        </div>
        <p className="muted small">Le lien fonctionne tant que Postri reste ouvert sur ce PC.</p>
      </div>
    )
  }

  const busy = state.status === 'starting' || state.status === 'downloading'
  return (
    <div className="netshare">
      {state.status === 'error' ? (
        <p className="netshare-error">{state.error || 'Le partage n’a pas pu démarrer.'}</p>
      ) : (
        <p className="muted small">
          {state.status === 'downloading'
            ? 'Préparation du partage (téléchargement de cloudflared, une seule fois)…'
            : state.status === 'starting'
              ? 'Ouverture du tunnel…'
              : 'Donne accès à Postri depuis n’importe où, sans hébergeur. Tes invités devront saisir un code.'}
        </p>
      )}
      <button className="btn primary small" onClick={start} disabled={busy}>
        <Icon.Share /> {busy ? 'Ouverture…' : state.status === 'error' ? 'Réessayer' : 'Partager sur Internet'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Écran du code d'accès (invités arrivés par le lien public)          */
/* ------------------------------------------------------------------ */

export function AccessGate({ onAccess }: { onAccess: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const format = (v: string) => {
    const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (r.ok) return onAccess()
      const data = await r.json().catch(() => ({}))
      setError(data.error || 'Ce code ne correspond pas.')
    } catch {
      setError('Le PC qui héberge ne répond pas. Il est peut-être éteint, ou le partage a été arrêté.')
    }
    setBusy(false)
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <Logo size={40} />
        <h1>Entre le code d’accès</h1>
        <p className="muted">La personne qui t’a envoyé le lien a aussi un code à 6 caractères. Il protège ses boards.</p>
        <label className="field">
          <span>Code d’accès</span>
          <input
            autoFocus
            className="gate-input"
            value={code}
            onChange={(e) => setCode(format(e.target.value))}
            placeholder="ABC-123"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!error}
          />
        </label>
        {error && <p className="netshare-error">{error}</p>}
        <button className="btn primary" disabled={busy || code.replace('-', '').length < 6}>
          {busy ? 'Vérification…' : 'Entrer'}
        </button>
      </form>
    </div>
  )
}
