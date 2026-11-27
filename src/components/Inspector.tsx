import type { ReactNode } from 'react'
import type { ArrowHeads, BoardElement, FillMode } from '../lib/types'
import { COLORS, FONT_SIZES, NOTE_COLORS, STROKE_WIDTHS, cssColor, cssNote } from '../lib/constants'
import { Icon } from './icons'

interface Props {
  elements: BoardElement[]
  onChange: (changes: Partial<BoardElement>) => void
  onFront: () => void
  onBack: () => void
  onDuplicate: () => void
  onDelete: () => void
}

const FILLS: { value: FillMode; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'tint', label: 'Léger' },
  { value: 'solid', label: 'Plein' },
]

const HEADS: { value: ArrowHeads; label: string }[] = [
  { value: 'end', label: '→' },
  { value: 'both', label: '↔' },
  { value: 'none', label: 'Aucune' },
]

const isShape = (e: BoardElement) => e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond'
const hasText = (e: BoardElement) => e.type === 'note' || e.type === 'text' || isShape(e)

/** valeur commune à toute la sélection, sinon undefined */
function common<K extends keyof BoardElement>(els: BoardElement[], key: K, fallback: BoardElement[K]) {
  const vals = new Set(els.map((e) => e[key] ?? fallback))
  return vals.size === 1 ? [...vals][0] : undefined
}

export function Inspector({ elements, onChange, onFront, onBack, onDuplicate, onDelete }: Props) {
  const notes = elements.filter((e) => e.type === 'note')
  const colored = elements.filter((e) => e.type !== 'note')
  const shapes = elements.filter(isShape)
  const stroked = elements.filter((e) => isShape(e) || e.type === 'arrow' || e.type === 'draw')
  const dashable = elements.filter((e) => isShape(e) || e.type === 'arrow')
  const arrows = elements.filter((e) => e.type === 'arrow')
  const texts = elements.filter(hasText)

  const title =
    elements.length > 1
      ? `${elements.length} éléments`
      : ({ note: 'Post-it', text: 'Texte', rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Losange', arrow: 'Flèche', draw: 'Dessin' } as const)[
          elements[0].type
        ]

  return (
    <aside className="panel inspector" onPointerDown={(e) => e.stopPropagation()} aria-label="Style de la sélection">
      <h2 className="inspector-title">{title}</h2>

      {notes.length > 0 && (
        <Section label="Couleur du post-it">
          <div className="swatches">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.key}
                className="swatch swatch-note"
                style={{ background: cssNote(c.key) }}
                aria-pressed={common(notes, 'noteColor', 'lemon') === c.key}
                title={c.label}
                aria-label={c.label}
                onClick={() => onChange({ noteColor: c.key })}
              />
            ))}
          </div>
        </Section>
      )}

      {colored.length > 0 && (
        <Section label={shapes.length || arrows.length || stroked.length ? 'Couleur' : 'Couleur du texte'}>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c.key}
                className="swatch"
                style={{ background: cssColor(c.key) }}
                aria-pressed={common(colored, 'color', 'ink') === c.key}
                title={c.label}
                aria-label={c.label}
                onClick={() => onChange({ color: c.key })}
              />
            ))}
          </div>
        </Section>
      )}

      {shapes.length > 0 && (
        <Section label="Remplissage">
          <Segmented
            options={FILLS}
            value={common(shapes, 'fill', 'none')}
            onChange={(fill) => onChange({ fill })}
          />
        </Section>
      )}

      {stroked.length > 0 && (
        <Section label="Épaisseur">
          <Segmented
            options={STROKE_WIDTHS}
            value={common(stroked, 'strokeWidth', 2)}
            onChange={(strokeWidth) => onChange({ strokeWidth })}
          />
        </Section>
      )}

      {dashable.length > 0 && (
        <Section label="Trait">
          <Segmented
            options={[
              { value: false, label: 'Continu' },
              { value: true, label: 'Pointillés' },
            ]}
            value={common(dashable, 'dashed', false)}
            onChange={(dashed) => onChange({ dashed })}
          />
        </Section>
      )}

      {arrows.length > 0 && (
        <Section label="Pointes">
          <Segmented options={HEADS} value={common(arrows, 'heads', 'end')} onChange={(heads) => onChange({ heads })} />
        </Section>
      )}

      {texts.length > 0 && (
        <Section label="Taille du texte">
          <Segmented
            options={FONT_SIZES}
            value={common(texts, 'fontSize', 18)}
            onChange={(fontSize) => onChange({ fontSize })}
          />
        </Section>
      )}

      <div className="inspector-actions">
        <button className="icon-btn" onClick={onFront} title="Premier plan (])" aria-label="Premier plan">
          <Icon.Front />
        </button>
        <button className="icon-btn" onClick={onBack} title="Arrière-plan ([)" aria-label="Arrière-plan">
          <Icon.Back />
        </button>
        <button className="icon-btn" onClick={onDuplicate} title="Dupliquer (Ctrl+D)" aria-label="Dupliquer">
          <Icon.Copy />
        </button>
        <button className="icon-btn danger" onClick={onDelete} title="Supprimer (Suppr)" aria-label="Supprimer">
          <Icon.Trash />
        </button>
      </div>
    </aside>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <h3>{label}</h3>
      {children}
    </section>
  )
}

function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
