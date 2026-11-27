import { useEffect, useId, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { BoardSummary, NoteColor, UserInfo } from '../lib/types'
import { initials } from '../lib/user'
import { Icon } from './icons'
import { useSession } from '../lib/session'
import { TunnelBanner } from './Share'

/* ------------------------------------------------------------------ */

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
function ago(ts: number) {
  const s = (ts - Date.now()) / 1000
  const abs = Math.abs(s)
  if (abs < 45) return 'à l’instant'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day')
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const SWATCHES: NoteColor[] = ['lemon', 'sky', 'mint', 'pink', 'lilac', 'peach']
function swatchFor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `var(--n-${SWATCHES[h % SWATCHES.length]})`
}

/* ------------------------------------------------------------------ */
/* Modèles                                                             */
/* ------------------------------------------------------------------ */

export type TemplateKey = 'blank' | 'speedboat' | 'kanban' | 'brainstorm' | 'architecture'

const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s })
const note = (c: NoteColor) => `var(--n-${c})`

const TEMPLATES: { key: TemplateKey; label: string; preview: ReactNode }[] = [
  { key: 'blank', label: 'Board vide', preview: <span className="tpl-preview" /> },
  {
    key: 'speedboat',
    label: 'Rétro Speedboat',
    preview: (
      <span className="tpl-preview tpl-sea">
        <span style={abs({ left: 0, right: 0, top: 30, height: 2, background: 'var(--c-cobalt)', opacity: 0.5 })} />
        <span style={abs({ left: 12, top: 8, width: 18, height: 18, background: note('mint') })} />
        <span style={abs({ left: 36, top: 38, width: 18, height: 18, background: note('peach') })} />
        <span style={abs({ right: 16, top: 8, width: 18, height: 18, background: note('lemon') })} />
      </span>
    ),
  },
  {
    key: 'kanban',
    label: 'Kanban',
    preview: (
      <span className="tpl-preview tpl-kanban">
        {[
          ['lemon', 'lemon'],
          ['sky'],
          ['mint'],
        ].map((col, i) => (
          <span key={i} className="tpl-col">
            {col.map((c, j) => (
              <span key={j} style={{ height: 10, background: note(c as NoteColor) }} />
            ))}
          </span>
        ))}
      </span>
    ),
  },
  {
    key: 'brainstorm',
    label: 'Brainstorm',
    preview: (
      <span className="tpl-preview">
        <span style={abs({ left: '50%', top: 22, width: 34, height: 20, marginLeft: -17, border: '2px solid var(--c-ink)', borderRadius: '50%' })} />
        <span style={abs({ left: 14, top: 8, width: 16, height: 16, background: note('pink') })} />
        <span style={abs({ right: 14, top: 40, width: 16, height: 16, background: note('lilac') })} />
        <span style={abs({ left: 18, top: 42, width: 16, height: 16, background: note('lemon') })} />
      </span>
    ),
  },
  {
    key: 'architecture',
    label: 'Schéma d’architecture',
    preview: (
      <span className="tpl-preview">
        <span style={abs({ left: 12, top: 22, width: 30, height: 20, border: '2px solid var(--c-ink)', borderRadius: 4 })} />
        <span style={abs({ left: 46, top: 32, width: 20, height: 2, background: 'var(--c-ink)' })} />
        <span style={abs({ left: 72, top: 20, width: 22, height: 22, border: '2px solid var(--c-violet)', transform: 'rotate(45deg)' })} />
      </span>
    ),
  },
]

/* ------------------------------------------------------------------ */

interface Props {
  user: UserInfo
  onOpen: (id: string) => void
  onEditUser: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

const RECENT = 5

export function Home({ user, onOpen, onEditUser, theme, onToggleTheme }: Props) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<TemplateKey>('blank')
  const [creating, setCreating] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const session = useSession()

  const load = () =>
    fetch('/api/boards')
      .then((r) => {
        if (r.status === 401) location.reload()
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((list: BoardSummary[]) => {
        setBoards(list)
        setError(null)
      })
      .catch(() => setError('Le serveur Postri ne répond pas. Vérifie qu’il est lancé (npm run dev ou npm start).'))

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    const tpl = TEMPLATES.find((t) => t.key === template)!
    const fallback = template === 'blank' ? 'Board sans titre' : tpl.label
    try {
      const r = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || fallback, template }),
      })
      if (!r.ok) throw new Error()
      const b = (await r.json()) as BoardSummary
      onOpen(b.id)
    } catch {
      setError('Impossible de créer le board : le serveur ne répond pas.')
      setCreating(false)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/boards/${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    load()
  }

  const shown = boards ? (showAll ? boards : boards.slice(0, RECENT)) : []
  const toDelete = boards?.find((b) => b.id === confirmDelete) ?? null

  if (!session.host) {
    return (
      <GuestHome
        boards={boards}
        error={error}
        user={user}
        onOpen={onOpen}
        onEditUser={onEditUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    )
  }

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <Logo />
          <span>Postri</span>
        </div>
        <div className="home-top-actions">
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Changer de thème" title="Changer de thème">
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          <button className="me" onClick={onEditUser} title="Modifier ton profil">
            <span className="avatar" style={{ background: user.color }}>
              {initials(user.name)}
            </span>
            {user.name}
          </button>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-hero-inner">
          <h1>On prépare quoi aujourd’hui ?</h1>

          <form className="create" onSubmit={create}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du board, ex. Rétro sprint 5"
              maxLength={80}
              aria-label="Nom du nouveau board"
            />
            <button className="btn primary" disabled={creating}>
              {creating ? 'Création…' : 'Créer le board'}
            </button>
          </form>

          <p className="tpl-label" id="tpl-label">
            Ou partir d’un modèle
          </p>
          <div className="templates" role="radiogroup" aria-labelledby="tpl-label">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={template === t.key}
                className="tpl"
                onClick={() => setTemplate(t.key)}
                onDoubleClick={(e) => {
                  setTemplate(t.key)
                  ;(e.currentTarget.closest('.home-hero-inner')?.querySelector('form') as HTMLFormElement | null)?.requestSubmit()
                }}
              >
                <span aria-hidden="true">{t.preview}</span>
                <span className="tpl-name">{t.label}</span>
              </button>
            ))}
          </div>

          <TunnelBanner />
        </div>
      </section>

      <section className="home-recent" aria-labelledby="recent-title">
        <div className="recent-head">
          <h2 id="recent-title">{showAll ? 'Tous les boards' : 'Récents'}</h2>
          {boards && boards.length > RECENT && (
            <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Voir seulement les récents' : `Voir les ${boards.length} boards`}
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        {boards === null && !error && <p className="muted">Chargement…</p>}
        {boards?.length === 0 && <p className="muted recent-empty">Tes boards apparaîtront ici.</p>}

        {shown.length > 0 && (
          <div className="table-wrap">
            <table className="recent-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Éléments</th>
                  <th>Modifié</th>
                  <th>Présents</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <a
                        className="recent-name"
                        href={`#/b/${b.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          onOpen(b.id)
                        }}
                      >
                        <span className="recent-swatch" style={{ background: swatchFor(b.id) }} aria-hidden="true" />
                        {b.name}
                      </a>
                    </td>
                    <td className="muted">{b.count}</td>
                    <td className="muted">{ago(b.updatedAt)}</td>
                    <td>
                      {b.people?.length ? (
                        <span className="people" title={b.people.map((p) => p.name).join(', ')}>
                          {b.people.slice(0, 4).map((p, i) => (
                            <span key={i} className="avatar small" style={{ background: p.color }}>
                              {initials(p.name)}
                            </span>
                          ))}
                          {b.people.length > 4 && <span className="avatar small more">+{b.people.length - 4}</span>}
                        </span>
                      ) : (
                        <span className="muted">Personne</span>
                      )}
                    </td>
                    <td className="recent-actions">
                      <button
                        className="icon-btn subtle"
                        onClick={() => setConfirmDelete(b.id)}
                        aria-label={`Supprimer ${b.name}`}
                        title="Supprimer"
                      >
                        <Icon.Trash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toDelete && (
        <ConfirmDelete board={toDelete} onCancel={() => setConfirmDelete(null)} onConfirm={() => remove(toDelete.id)} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fenêtre de confirmation de suppression                              */
/* ------------------------------------------------------------------ */

function ConfirmDelete({ board, onCancel, onConfirm }: { board: BoardSummary; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const people = board.people?.length ?? 0

  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc">
        <span className="confirm-icon" aria-hidden="true">
          <Icon.Trash />
        </span>
        <h2 id="del-title">Supprimer « {board.name} » ?</h2>
        <p id="del-desc" className="muted">
          Ce board et ses {board.count} élément{board.count > 1 ? 's' : ''} seront supprimés pour tout le monde. Cette action est
          définitive.
          {people > 0 && ` ${people} personne${people > 1 ? 's sont connectées' : ' est connectée'} dessus et ${people > 1 ? 'seront déconnectées' : 'sera déconnectée'}.`}
        </p>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>
            Annuler
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onConfirm()
            }}
          >
            {busy ? 'Suppression…' : 'Supprimer le board'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Logo de Postri : version simplifiée de l'icône de l'application (build/icon-small.svg) */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DDE8FF" />
          <stop offset="1" stopColor="#A9BFFF" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill={`url(#${CSS.escape(id)})`} />
      <rect x="22" y="22" width="468" height="468" rx="106" fill="none" stroke="#1B2230" strokeOpacity="0.16" strokeWidth="12" />
      <path d="M48 232 L256 352 L256 386 L48 266 Z" fill="#C2CBDB" />
      <path d="M256 352 L464 232 L464 266 L256 386 Z" fill="#A3AEC3" />
      <g transform="matrix(0.866 0.5 -0.866 0.5 256 112)">
        <rect x="0" y="0" width="240" height="240" rx="16" fill="#FFFFFF" />
        <rect x="26" y="26" width="104" height="104" rx="8" fill="#1B2230" opacity="0.14" />
        <rect x="152" y="36" width="80" height="80" rx="8" fill="#1B2230" opacity="0.14" />
        <rect x="40" y="152" width="80" height="80" rx="8" fill="#1B2230" opacity="0.14" />
      </g>
      <g transform="translate(0 -26) matrix(0.866 0.5 -0.866 0.5 256 112)">
        <rect x="18" y="18" width="104" height="104" rx="8" fill="#FFD43B" />
        <rect x="144" y="28" width="80" height="80" rx="8" fill="#FF7FAB" />
        <rect x="32" y="144" width="80" height="80" rx="8" fill="#5FCB86" />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Accueil des invités : seulement les boards déverrouillés            */
/* ------------------------------------------------------------------ */

function GuestHome({
  boards,
  error,
  user,
  onOpen,
  onEditUser,
  theme,
  onToggleTheme,
}: {
  boards: BoardSummary[] | null
  error: string | null
  user: UserInfo
  onOpen: (id: string) => void
  onEditUser: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <Logo />
          <span>Postri</span>
        </div>
        <div className="home-top-actions">
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Changer de thème" title="Changer de thème">
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          <button className="me" onClick={onEditUser} title="Modifier ton profil">
            <span className="avatar" style={{ background: user.color }}>
              {initials(user.name)}
            </span>
            {user.name}
          </button>
        </div>
      </header>
      <section className="home-hero">
        <div className="home-hero-inner guest-hero">
          <h1>Tes boards partagés</h1>
          <p className="guest-lead">
            Tu es invité sur ce Postri. Pour rejoindre un autre board, ouvre le lien que t’a envoyé la personne qui l’héberge et
            saisis son code.
          </p>
        </div>
      </section>
      <section className="home-recent" aria-labelledby="guest-title">
        <h2 id="guest-title" className="guest-title">
          Boards déjà ouverts
        </h2>
        {error && <p className="error">{error}</p>}
        {boards?.length === 0 && <p className="muted recent-empty">Aucun pour l’instant.</p>}
        {boards && boards.length > 0 && (
          <ul className="guest-list">
            {boards.map((b) => (
              <li key={b.id}>
                <a
                  className="recent-name"
                  href={`#/b/${b.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    onOpen(b.id)
                  }}
                >
                  <span className="recent-swatch" style={{ background: swatchFor(b.id) }} aria-hidden="true" />
                  {b.name}
                </a>
                <span className="muted small">modifié {ago(b.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
