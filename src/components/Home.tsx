import { useEffect, useId, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { BoardSummary, NoteColor, UserInfo } from '../lib/types'
import { initials } from '../lib/user'
import { Icon } from './icons'
import { useLanUrl } from '../lib/useLanUrl'
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
  const lan = useLanUrl('/')
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

          {lan && (
            <p className="lan-hint">
              Sur ton réseau, tes collègues rejoignent sur <a href={lan}>{lan}</a>
            </p>
          )}
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
                      {confirmDelete === b.id ? (
                        <span className="confirm">
                          Supprimer pour tout le monde ?
                          <button className="btn danger small" onClick={() => remove(b.id)}>
                            Supprimer
                          </button>
                          <button className="btn ghost small" onClick={() => setConfirmDelete(null)}>
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          className="icon-btn subtle"
                          onClick={() => setConfirmDelete(b.id)}
                          aria-label={`Supprimer ${b.name}`}
                          title="Supprimer"
                        >
                          <Icon.Trash />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/** Logo de Postri : version simplifiée de l'icône de l'application (build/icon-small.svg) */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4A72FF" />
          <stop offset="1" stopColor="#1F3FCC" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${CSS.escape(id)})`} />
      <rect x="9" y="12" width="46" height="40" rx="7" fill="#F7F8FB" />
      <rect x="13" y="16" width="16" height="16" rx="2.5" fill="#FFDA5C" />
      <rect x="15" y="36" width="12" height="12" rx="2" fill="#FF9FC0" />
      <path d="M30 23 C36 23 39 26 41 30" fill="none" stroke="#1B2230" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="33" y="31" width="18" height="13" rx="3.5" fill="#E3EAFF" stroke="#2F5BFF" strokeWidth="2.6" />
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
