import { useState } from 'react'
import type { FormEvent } from 'react'
import { copyText, useInviteCode, useShare } from '../lib/session'
import { useLanUrl } from '../lib/useLanUrl'
import { Icon } from './icons'
import { Logo } from './Home'

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    await copyText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1600)
  }
  return { copied, copy }
}

/* ------------------------------------------------------------------ */
/* Inviter sur un board (PC qui héberge)                               */
/* ------------------------------------------------------------------ */

export function BoardInvite({ boardId }: { boardId: string }) {
  const path = `/#/b/${boardId}`
  const { code, renew } = useInviteCode(boardId, true)
  const lan = useLanUrl(path)
  const tunnel = useShare(true)
  const publicLink = tunnel.state.status === 'on' && tunnel.state.url ? tunnel.state.url + path : null
  const { copied, copy } = useCopied()
  const [confirmRenew, setConfirmRenew] = useState(false)

  return (
    <div className="invite">
      <div className="invite-code">
        <span className="invite-label">Code d’accès de ce board</span>
        <span className="netshare-code-row">
          <strong className="netshare-code">{code ?? '…'}</strong>
          {confirmRenew ? (
            <span className="confirm">
              <button
                className="btn danger small"
                onClick={async () => {
                  await renew()
                  setConfirmRenew(false)
                }}
              >
                Changer
              </button>
              <button className="btn ghost small" onClick={() => setConfirmRenew(false)}>
                Annuler
              </button>
            </span>
          ) : (
            <button className="btn ghost small" onClick={() => setConfirmRenew(true)}>
              Nouveau code
            </button>
          )}
        </span>
        <p className="muted small">
          {confirmRenew
            ? 'Les invités déjà connectés devront saisir le nouveau code.'
            : 'Ce code n’ouvre que ce board. Toi, sur ce PC, tu n’as pas besoin de le saisir.'}
        </p>
      </div>

      <div className="invite-field">
        <span className="invite-label">Sur ton réseau</span>
        <span className="share-row">
          <input readOnly value={lan ?? '…'} onFocus={(e) => e.currentTarget.select()} aria-label="Lien sur le réseau local" />
          <button className="btn ghost small" onClick={() => lan && copy('lan', lan)}>
            {copied === 'lan' ? 'Copié' : 'Copier'}
          </button>
        </span>
      </div>

      <div className="invite-field">
        <span className="invite-label">Sur Internet</span>
        {publicLink ? (
          <>
            <span className="share-row">
              <input readOnly value={publicLink} onFocus={(e) => e.currentTarget.select()} aria-label="Lien public" />
              <button className="btn ghost small" onClick={() => copy('net', publicLink)}>
                {copied === 'net' ? 'Copié' : 'Copier'}
              </button>
            </span>
            <span className="netshare-on-row">
              <span className="netshare-status">
                <i /> Actif tant que Postri reste ouvert
              </span>
              <button className="link-btn danger-link" onClick={tunnel.stop}>
                Arrêter
              </button>
            </span>
          </>
        ) : (
          <TunnelStart state={tunnel.state} onStart={tunnel.start} />
        )}
      </div>

      <button className="btn primary small invite-copy" onClick={() => code && copy('code', code)} disabled={!code}>
        {copied === 'code' ? (
          <>
            <Icon.Check /> Code copié
          </>
        ) : (
          'Copier le code'
        )}
      </button>
    </div>
  )
}

function TunnelStart({ state, onStart }: { state: ReturnType<typeof useShare>['state']; onStart: () => void }) {
  const busy = state.status === 'starting' || state.status === 'downloading'
  return (
    <div className="netshare">
      {state.status === 'error' ? (
        <p className="netshare-error">{state.error || 'Le partage n’a pas pu démarrer.'}</p>
      ) : (
        <p className="muted small">
          {state.status === 'downloading'
            ? 'Préparation (téléchargement de cloudflared, une seule fois)…'
            : state.status === 'starting'
              ? 'Ouverture du lien public…'
              : 'Crée un lien public pour inviter des personnes qui ne sont pas sur ton réseau.'}
        </p>
      )}
      <button className="btn ghost small" onClick={onStart} disabled={busy}>
        <Icon.Share /> {busy ? 'Ouverture…' : state.status === 'error' ? 'Réessayer' : 'Partager sur Internet'}
      </button>
    </div>
  )
}

/** Bandeau de l'accueil quand le lien public est actif (PC qui héberge) */
export function TunnelBanner() {
  const { state, stop } = useShare(true)
  if (state.status !== 'on' || !state.url) return null
  return (
    <div className="tunnel-banner" role="status">
      <span className="netshare-status">
        <i /> Postri est accessible sur Internet
      </span>
      <span className="muted small">Chaque invité a besoin du code du board que tu partages.</span>
      <button className="btn ghost small" onClick={stop}>
        Arrêter le partage sur Internet
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Écran du code d'accès (invités)                                     */
/* ------------------------------------------------------------------ */

export function AccessGate({ boardId, onAccess, onHome }: { boardId: string; onAccess: () => void; onHome: () => void }) {
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
      const r = await fetch(`/api/boards/${boardId}/access`, {
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
        <p className="muted">Ce board est protégé. La personne qui t’a envoyé le lien a aussi un code à 6 caractères.</p>
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
          {busy ? 'Vérification…' : 'Ouvrir le board'}
        </button>
        <button type="button" className="link-btn gate-home" onClick={onHome}>
          Voir mes autres boards
        </button>
      </form>
    </div>
  )
}
