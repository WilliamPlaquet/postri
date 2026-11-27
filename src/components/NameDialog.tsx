import { useState } from 'react'
import type { UserInfo } from '../lib/types'
import { PEOPLE_COLORS } from '../lib/constants'
import { initials, saveUser } from '../lib/user'

interface Props {
  initial: UserInfo | null
  onSave: (u: UserInfo) => void
  onCancel?: () => void
}

export function NameDialog({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? PEOPLE_COLORS[Math.floor(Math.random() * PEOPLE_COLORS.length)])

  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel?.()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSave(saveUser(name, color))
        }}
      >
        <div className="dialog-avatar" style={{ background: color }}>
          {initials(name)}
        </div>
        <h2>{initial ? 'Ton profil' : 'Comment tu t’appelles ?'}</h2>
        <p className="muted">Les autres verront ce nom à côté de ton curseur.</p>
        <label className="field">
          <span>Ton nom</span>
          <input autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Ex. William" />
        </label>
        <div className="field">
          <span>Ta couleur</span>
          <div className="swatches">
            {PEOPLE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className="swatch"
                style={{ background: c }}
                aria-pressed={c === color}
                aria-label={`Couleur ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Annuler
            </button>
          )}
          <button className="btn primary" disabled={!name.trim()}>
            {initial ? 'Enregistrer' : 'Continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}
