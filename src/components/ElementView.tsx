import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { BoardElement, Point } from '../lib/types'
import { cssColor, cssNote } from '../lib/constants'
import { arrowHeadPath, smoothPath } from '../lib/geometry'

interface TextProps {
  el: BoardElement
  editing: boolean
  onText: (id: string, text: string) => void
  onEditEnd: (id: string) => void
  /** taille mesurée du texte (pour les blocs de texte qui s'adaptent) */
  onMeasure?: (id: string, h: number) => void
}

/** Zone de texte éditable en place (même rendu en lecture et en édition) */
function EditableText({ el, editing, onText, onEditEnd, onMeasure, className }: TextProps & { className: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // En édition, le DOM est la source : on n'écrase pas la frappe en cours
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!editing) {
      node.innerText = el.text || ''
    }
  }, [el.text, editing])

  useEffect(() => {
    const node = ref.current
    if (!node || !editing) return
    node.innerText = el.text || ''
    // après le clic qui a déclenché l'édition, sinon le navigateur reprend le focus
    const t = setTimeout(() => {
      node.focus({ preventScroll: true })
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useLayoutEffect(() => {
    if (!onMeasure || !ref.current) return
    const h = Math.ceil(ref.current.offsetHeight)
    if (Math.abs(h - el.h) > 1) onMeasure(el.id, h)
  })

  return (
    <div
      ref={ref}
      className={className}
      contentEditable={editing ? 'plaintext-only' : false}
      suppressContentEditableWarning
      spellCheck={editing}
      data-placeholder={editing ? 'Écris ici…' : undefined}
      onInput={(e) => onText(el.id, (e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, ''))}
      onBlur={() => onEditEnd(el.id)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          ;(e.currentTarget as HTMLDivElement).blur()
        }
        e.stopPropagation()
      }}
      onPointerDown={(e) => editing && e.stopPropagation()}
      style={{ fontSize: el.fontSize ?? 18 }}
    />
  )
}

const boxStyle = (el: BoardElement): CSSProperties => ({
  transform: `translate(${el.x}px, ${el.y}px)`,
  width: el.w,
  height: el.h,
  zIndex: 1,
})

export const NoteView = memo(function NoteView(props: TextProps) {
  const { el } = props
  return (
    <div
      className={`el note${props.editing ? ' is-editing' : ''}`}
      data-id={el.id}
      style={{ ...boxStyle(el), background: cssNote(el.noteColor) }}
    >
      <EditableText {...props} className="el-text note-text" />
    </div>
  )
})

export const TextView = memo(function TextView(props: TextProps) {
  const { el } = props
  return (
    <div
      className={`el text-el${props.editing ? ' is-editing' : ''}`}
      data-id={el.id}
      style={{ ...boxStyle(el), height: 'auto', minHeight: el.h, color: cssColor(el.color) }}
    >
      <EditableText {...props} className="el-text" />
    </div>
  )
})

export const ShapeView = memo(function ShapeView(props: TextProps) {
  const { el } = props
  const sw = el.strokeWidth ?? 2
  const color = cssColor(el.color)
  const fill =
    el.fill === 'solid' ? color : el.fill === 'tint' ? `color-mix(in srgb, ${color} 14%, var(--panel))` : 'transparent'
  const inset = sw / 2
  const w = Math.max(el.w, 1)
  const h = Math.max(el.h, 1)
  const common = {
    fill,
    stroke: color,
    strokeWidth: sw,
    strokeDasharray: el.dashed ? `${sw * 4} ${sw * 3}` : undefined,
    strokeLinejoin: 'round' as const,
  }
  return (
    <div
      className={`el shape${el.fill === 'solid' ? ' on-solid' : ''}${props.editing ? ' is-editing' : ''}`}
      data-id={el.id}
      style={{ ...boxStyle(el), color: el.fill === 'solid' ? 'var(--on-solid)' : 'var(--c-ink)' }}
    >
      <svg className="shape-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {el.type === 'rect' && (
          <rect x={inset} y={inset} width={Math.max(w - sw, 0)} height={Math.max(h - sw, 0)} rx={Math.min(12, w / 4, h / 4)} {...common} />
        )}
        {el.type === 'ellipse' && <ellipse cx={w / 2} cy={h / 2} rx={Math.max(w / 2 - inset, 0)} ry={Math.max(h / 2 - inset, 0)} {...common} />}
        {el.type === 'diamond' && (
          <path d={`M${w / 2} ${inset} L${w - inset} ${h / 2} L${w / 2} ${h - inset} L${inset} ${h / 2} Z`} {...common} />
        )}
      </svg>
      <div className={`shape-label shape-label-${el.type}`}>
        <EditableText {...props} className="el-text" />
      </div>
    </div>
  )
})

export const ArrowView = memo(function ArrowView({ el, a, b }: { el: BoardElement; a: Point; b: Point }) {
  const sw = el.strokeWidth ?? 2
  const pad = 24 + sw * 3
  const x = Math.min(a.x, b.x) - pad
  const y = Math.min(a.y, b.y) - pad
  const w = Math.abs(a.x - b.x) + pad * 2
  const h = Math.abs(a.y - b.y) + pad * 2
  const la = { x: a.x - x, y: a.y - y }
  const lb = { x: b.x - x, y: b.y - y }
  const heads = el.heads ?? 'end'
  const head = 10 + sw * 2.5
  const color = cssColor(el.color)
  const line = `M${la.x} ${la.y} L${lb.x} ${lb.y}`
  return (
    <svg
      className="el arrow"
      data-id={el.id}
      width={w}
      height={h}
      style={{ transform: `translate(${x}px, ${y}px)`, zIndex: 1 }}
    >
      <path d={line} className="hit" />
      <g stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={line} strokeDasharray={el.dashed ? `${sw * 4} ${sw * 3}` : undefined} />
        {heads !== 'none' && <path d={arrowHeadPath(la, lb, head)} />}
        {heads === 'both' && <path d={arrowHeadPath(lb, la, head)} />}
      </g>
    </svg>
  )
})

export const DrawView = memo(function DrawView({ el }: { el: BoardElement }) {
  const vw = Math.max(el.vw ?? el.w, 1)
  const vh = Math.max(el.vh ?? el.h, 1)
  const d = smoothPath(el.points ?? [])
  const sw = el.strokeWidth ?? 2
  return (
    <svg
      className="el draw"
      data-id={el.id}
      width={Math.max(el.w, 1)}
      height={Math.max(el.h, 1)}
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
      style={{ transform: `translate(${el.x}px, ${el.y}px)`, zIndex: 1 }}
    >
      <path d={d} className="hit" vectorEffect="non-scaling-stroke" />
      <path
        d={d}
        stroke={cssColor(el.color)}
        strokeWidth={sw + 1}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
})
