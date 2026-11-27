import type { ArrowEnd, BoardElement, Box, Camera, Point } from './types'

export const isBindable = (el: BoardElement | undefined): el is BoardElement =>
  !!el && el.type !== 'arrow' && el.type !== 'draw'

export function screenToWorld(p: Point, cam: Camera): Point {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom }
}

export function worldToScreen(p: Point, cam: Camera): Point {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y }
}

const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** Point où un rayon partant du centre de l'élément vers `toward` sort de sa forme */
function boundaryPoint(el: BoardElement, toward: Point, gap = 6): Point {
  const c = center(el)
  let dx = toward.x - c.x
  let dy = toward.y - c.y
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return c
  dx /= len
  dy /= len
  const hw = Math.max(el.w / 2, 1)
  const hh = Math.max(el.h / 2, 1)
  let t: number
  if (el.type === 'ellipse') {
    t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh))
  } else if (el.type === 'diamond') {
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
  } else {
    t = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity)
  }
  t = Math.min(t + gap, len)
  return { x: c.x + dx * t, y: c.y + dy * t }
}

/** Positions réelles des deux extrémités d'une flèche (en tenant compte des accroches) */
export function resolveArrow(el: BoardElement, elements: Record<string, BoardElement>): { a: Point; b: Point } {
  const s = el.start ?? { x: el.x, y: el.y }
  const e = el.end ?? { x: el.x + el.w, y: el.y + el.h }
  const sT = s.bind ? elements[s.bind] : undefined
  const eT = e.bind ? elements[e.bind] : undefined
  const sRef: Point = isBindable(sT) ? center(sT) : s
  const eRef: Point = isBindable(eT) ? center(eT) : e
  const a = isBindable(sT) ? boundaryPoint(sT, eRef) : { x: s.x, y: s.y }
  const b = isBindable(eT) ? boundaryPoint(eT, sRef) : { x: e.x, y: e.y }
  return { a, b }
}

export function elementBox(el: BoardElement, elements: Record<string, BoardElement>): Box {
  if (el.type === 'arrow') {
    const { a, b } = resolveArrow(el, elements)
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h }
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const b of boxes) {
    x1 = Math.min(x1, b.x)
    y1 = Math.min(y1, b.y)
    x2 = Math.max(x2, b.x + b.w)
    y2 = Math.max(y2, b.y + b.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

export function normalizeBox(p1: Point, p2: Point): Box {
  return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p1.x - p2.x), h: Math.abs(p1.y - p2.y) }
}

export function pointInBox(p: Point, b: Box, pad = 0): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad
}

/** Élément accrochable le plus haut sous le point (pour les flèches) */
export function bindableAt(p: Point, list: BoardElement[], exclude?: string): BoardElement | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i]
    if (el.id === exclude || !isBindable(el)) continue
    if (pointInBox(p, el, 4)) return el
  }
  return undefined
}

/** Tracé lissé d'un dessin à main levée */
export function smoothPath(points: number[]): string {
  if (points.length < 4) {
    if (points.length === 2) return `M${points[0]} ${points[1]}l0.01 0`
    return ''
  }
  let d = `M${points[0].toFixed(1)} ${points[1].toFixed(1)}`
  for (let i = 2; i < points.length - 2; i += 2) {
    const mx = (points[i] + points[i + 2]) / 2
    const my = (points[i + 1] + points[i + 3]) / 2
    d += ` Q${points[i].toFixed(1)} ${points[i + 1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const n = points.length
  d += ` L${points[n - 2].toFixed(1)} ${points[n - 1].toFixed(1)}`
  return d
}

export function arrowHeadPath(from: Point, to: Point, size: number): string {
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  const spread = Math.PI / 7
  const p1 = { x: to.x - size * Math.cos(ang - spread), y: to.y - size * Math.sin(ang - spread) }
  const p2 = { x: to.x - size * Math.cos(ang + spread), y: to.y - size * Math.sin(ang + spread) }
  return `M${p1.x} ${p1.y} L${to.x} ${to.y} L${p2.x} ${p2.y}`
}

export const endPoint = (e: ArrowEnd | undefined, fallback: Point): Point => (e ? { x: e.x, y: e.y } : fallback)

export function uid(): string {
  const a = new Uint8Array(8)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}
