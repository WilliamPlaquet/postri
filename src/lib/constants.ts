import type { ColorKey, FontSize, NoteColor, StrokeWidth, Tool } from './types'

export const COLORS: { key: ColorKey; label: string }[] = [
  { key: 'ink', label: 'Encre' },
  { key: 'cobalt', label: 'Cobalt' },
  { key: 'red', label: 'Rouge' },
  { key: 'orange', label: 'Orange' },
  { key: 'green', label: 'Vert' },
  { key: 'violet', label: 'Violet' },
  { key: 'grey', label: 'Gris' },
]

export const NOTE_COLORS: { key: NoteColor; label: string }[] = [
  { key: 'lemon', label: 'Citron' },
  { key: 'peach', label: 'Pêche' },
  { key: 'pink', label: 'Rose' },
  { key: 'mint', label: 'Menthe' },
  { key: 'sky', label: 'Ciel' },
  { key: 'lilac', label: 'Lilas' },
  { key: 'paper', label: 'Papier' },
]

export const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 14, label: 'S' },
  { value: 18, label: 'M' },
  { value: 24, label: 'L' },
  { value: 36, label: 'XL' },
]

export const STROKE_WIDTHS: { value: StrokeWidth; label: string }[] = [
  { value: 1, label: 'Fin' },
  { value: 2, label: 'Moyen' },
  { value: 4, label: 'Épais' },
]

/** Couleurs attribuées aux participants (curseurs, avatars) */
export const PEOPLE_COLORS = ['#2F5BFF', '#E5484D', '#F08C00', '#2F9E62', '#7C4DFF', '#D6409F', '#0E9AA7', '#8B5E34']

export const cssColor = (key: ColorKey = 'ink') => `var(--c-${key})`
export const cssNote = (key: NoteColor = 'lemon') => `var(--n-${key})`

export const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Sélection', key: 'V' },
  { tool: 'hand', label: 'Déplacer la vue', key: 'H' },
  { tool: 'note', label: 'Post-it', key: 'N' },
  { tool: 'text', label: 'Texte', key: 'T' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', key: 'O' },
  { tool: 'diamond', label: 'Losange', key: 'D' },
  { tool: 'arrow', label: 'Flèche', key: 'A' },
  { tool: 'draw', label: 'Crayon', key: 'P' },
]

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const GRID = 24
