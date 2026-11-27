export type ElementType = 'note' | 'text' | 'rect' | 'ellipse' | 'diamond' | 'arrow' | 'draw'

export type Tool = 'select' | 'hand' | 'note' | 'text' | 'rect' | 'ellipse' | 'diamond' | 'arrow' | 'draw'

export type ColorKey = 'ink' | 'cobalt' | 'red' | 'orange' | 'green' | 'violet' | 'grey'
export type NoteColor = 'lemon' | 'peach' | 'pink' | 'mint' | 'sky' | 'lilac' | 'paper'
export type FillMode = 'none' | 'tint' | 'solid'
export type StrokeWidth = 1 | 2 | 4
export type FontSize = 14 | 18 | 24 | 36
export type ArrowHeads = 'end' | 'both' | 'none'

export interface ArrowEnd {
  x: number
  y: number
  /** id de l'élément auquel l'extrémité est accrochée */
  bind?: string
}

export interface BoardElement {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  /** ordre d'empilement */
  z: number
  text?: string
  fontSize?: FontSize
  noteColor?: NoteColor
  color?: ColorKey
  fill?: FillMode
  strokeWidth?: StrokeWidth
  dashed?: boolean
  align?: 'left' | 'center'
  // flèches
  start?: ArrowEnd
  end?: ArrowEnd
  heads?: ArrowHeads
  curved?: boolean
  // dessin à main levée : points dans le repère d'origine (vw × vh)
  points?: number[]
  vw?: number
  vh?: number
  createdBy?: string
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface UserInfo {
  name: string
  color: string
}

export interface PresenceState {
  user: UserInfo
  cursor: Point | null
  selection: string[]
  editing: string | null
}

export interface Peer extends PresenceState {
  clientId: number
}

export interface BoardSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  count: number
  online: number
  /** personnes connectées en ce moment */
  people?: UserInfo[]
}
