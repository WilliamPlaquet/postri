import { useEffect, useRef, useState } from 'react'
import type { Peer, Tool, UserInfo } from '../lib/types'
import type { ConnectionStatus } from '../lib/useBoard'
import { TOOLS } from '../lib/constants'
import { initials } from '../lib/user'
import { useLanUrl } from '../lib/useLanUrl'
import { Icon, ToolIcon } from './icons'
import { Logo } from './Home'
import { BoardInvite } from './Share'
import { useSession } from '../lib/session'

/* ------------------------------------------------------------------ */

interface TopBarProps {
  boardId: string
  name: string
  onRename: (n: string) => void
  status: ConnectionStatus
  synced: boolean
  peers: Peer[]
  user: UserInfo
  onEditUser: () => void
  onHome: () => void
  onFollow: (p: Peer) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onExport: () => void
  onImport: (file: File) => void
}

export function TopBar(props: TopBarProps) {
  const { name, status, synced, peers, user } = props
  const [draft, setDraft] = useState<string | null>(null)
  const [menu, setMenu] = useState<'share' | 'more' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const shareUrl = useLanUrl(`/#/b/${props.boardId}`)
  const session = useSession()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.popover, [data-popover-trigger]')) setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const commitName = () => {
    if (draft !== null && draft.trim() && draft.trim() !== name) props.onRename(draft.trim().slice(0, 80))
    setDraft(null)
  }

  const statusLabel = status === 'connected' ? (synced ? 'Synchronisé' : 'Synchronisation…') : status === 'connecting' ? 'Connexion…' : 'Hors ligne'

  const copy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const shown = peers.slice(0, 4)

  return (
    <header className="topbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel topbar-left">
        <button className="icon-btn" onClick={props.onHome} title="Tous les boards" aria-label="Retour à la liste des boards">
          <Icon.Home />
        </button>
        <span className="topbar-logo">
          <Logo size={22} />
        </span>
        {draft === null ? (
          <button className="board-title" onClick={() => setDraft(name)} title="Renommer le board">
            {name || 'Board sans titre'}
          </button>
        ) : (
          <input
            className="board-title-input"
            autoFocus
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setDraft(null)
              e.stopPropagation()
            }}
            aria-label="Nom du board"
          />
        )}
        <span className={`status status-${status === 'connected' && synced ? 'ok' : status === 'disconnected' ? 'off' : 'wait'}`} title={statusLabel}>
          <i />
          <span className="status-label">{statusLabel}</span>
        </span>
      </div>

      <div className="panel topbar-right">
        <div className="avatars">
          {shown.map((p) => (
            <button
              key={p.clientId}
              className="avatar"
              style={{ background: p.user.color }}
              title={p.cursor ? `Aller vers ${p.user.name}` : p.user.name}
              aria-label={`Aller vers ${p.user.name}`}
              onClick={() => props.onFollow(p)}
            >
              {initials(p.user.name)}
            </button>
          ))}
          {peers.length > shown.length && <span className="avatar more">+{peers.length - shown.length}</span>}
          <button className="avatar me-avatar" style={{ background: user.color }} title={`${user.name} (toi) — modifier`} onClick={props.onEditUser}>
            {initials(user.name)}
          </button>
        </div>

        <button className="btn primary small" data-popover-trigger onClick={() => setMenu(menu === 'share' ? null : 'share')}>
          <Icon.Share /> <span className="share-label">Partager</span>
        </button>
        <button
          className="icon-btn"
          data-popover-trigger
          onClick={() => setMenu(menu === 'more' ? null : 'more')}
          aria-label="Plus d’options"
          title="Plus d’options"
        >
          <Icon.Menu />
        </button>

        {menu === 'share' && (
          <div className="popover share-pop">
            <h3>Inviter sur ce board</h3>
            {session.host ? (
              <BoardInvite boardId={props.boardId} boardName={name} />
            ) : (
              <>
                <p className="muted">Envoie ce lien avec le code d’accès que tu as reçu : il n’ouvre que ce board.</p>
                <div className="share-row">
                  <input readOnly value={shareUrl ?? '…'} onFocus={(e) => e.currentTarget.select()} aria-label="Lien du board" />
                  <button className="btn primary small" onClick={copy}>
                    {copied ? (
                      <>
                        <Icon.Check /> Copié
                      </>
                    ) : (
                      'Copier'
                    )}
                  </button>
                </div>
              </>
            )}
            <p className="muted small share-people">
              {peers.length === 0 ? 'Personne d’autre pour le moment.' : `${peers.length + 1} personnes sur le board.`}
            </p>
          </div>
        )}

        {menu === 'more' && (
          <div className="popover menu-pop" role="menu">
            <button role="menuitem" onClick={() => (props.onToggleTheme(), setMenu(null))}>
              {props.theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
              {props.theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
            </button>
            <button role="menuitem" onClick={() => (props.onExport(), setMenu(null))}>
              Exporter en JSON
            </button>
            <button role="menuitem" onClick={() => fileRef.current?.click()}>
              Importer un JSON
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onImport(f)
            e.target.value = ''
            setMenu(null)
          }}
        />
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */

export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <nav className="panel toolbar" aria-label="Outils" onPointerDown={(e) => e.stopPropagation()}>
      {TOOLS.map((t, i) => (
        <span key={t.tool} className="tool-wrap">
          {(i === 2 || i === 4 || i === 7) && <span className="tool-sep" />}
          <button
            className="tool"
            aria-pressed={tool === t.tool}
            aria-label={`${t.label} (${t.key})`}
            onClick={() => onTool(t.tool)}
          >
            <ToolIcon tool={t.tool} />
            <span className="tooltip">
              {t.label} <kbd>{t.key}</kbd>
            </span>
          </button>
        </span>
      ))}
    </nav>
  )
}

/* ------------------------------------------------------------------ */

interface ZoomProps {
  zoom: number
  onZoom: (factor: number) => void
  onReset: () => void
  onFit: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
}

export function BottomBar(p: ZoomProps) {
  return (
    <div className="bottombar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel group">
        <button className="icon-btn" onClick={p.onUndo} disabled={!p.canUndo} title="Annuler (Ctrl+Z)" aria-label="Annuler">
          <Icon.Undo />
        </button>
        <button className="icon-btn" onClick={p.onRedo} disabled={!p.canRedo} title="Rétablir (Ctrl+Y)" aria-label="Rétablir">
          <Icon.Redo />
        </button>
      </div>
      <div className="panel group">
        <button className="icon-btn" onClick={() => p.onZoom(1 / 1.2)} title="Dézoomer (-)" aria-label="Dézoomer">
          <Icon.Minus />
        </button>
        <button className="zoom-value" onClick={p.onReset} title="Revenir à 100 % (Ctrl+0)">
          {Math.round(p.zoom * 100)} %
        </button>
        <button className="icon-btn" onClick={() => p.onZoom(1.2)} title="Zoomer (+)" aria-label="Zoomer">
          <Icon.Plus />
        </button>
        <button className="icon-btn" onClick={p.onFit} title="Tout afficher (Maj+1)" aria-label="Tout afficher">
          <Icon.Fit />
        </button>
      </div>
      <div className="panel group">
        <button className="icon-btn" onClick={p.onHelp} title="Raccourcis clavier (?)" aria-label="Raccourcis clavier">
          <Icon.Help />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const SHORTCUTS: [string, string][] = [
  ['Déplacer la vue', 'Espace + glisser, molette, clic molette'],
  ['Zoomer', 'Ctrl + molette, pincer, + / -'],
  ['Tout afficher', 'Maj + 1'],
  ['Écrire dans un élément', 'Double-clic ou Entrée'],
  ['Nouveau post-it', 'Double-clic sur le fond'],
  ['Terminer l’écriture', 'Échap ou Ctrl + Entrée'],
  ['Sélection multiple', 'Maj + clic, ou glisser sur le fond'],
  ['Garder les proportions', 'Maj pendant le redimensionnement'],
  ['Flèche sans accroche', 'Alt pendant le tracé'],
  ['Dupliquer', 'Ctrl + D'],
  ['Copier / coller', 'Ctrl + C / Ctrl + V'],
  ['Annuler / rétablir', 'Ctrl + Z / Ctrl + Y'],
  ['Premier / arrière-plan', '] / ['],
  ['Supprimer', 'Suppr ou Retour arrière'],
]

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog help" role="dialog" aria-labelledby="help-title">
        <div className="dialog-head">
          <h2 id="help-title">Raccourcis</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon.Close />
          </button>
        </div>
        <dl className="shortcuts">
          {TOOLS.map((t) => (
            <div key={t.tool}>
              <dt>{t.label}</dt>
              <dd>
                <kbd>{t.key}</kbd>
              </dd>
            </div>
          ))}
          {SHORTCUTS.map(([a, b]) => (
            <div key={a}>
              <dt>{a}</dt>
              <dd>{b}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
