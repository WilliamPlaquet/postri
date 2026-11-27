// Contenu de départ des modèles de board.
// Chaque modèle renvoie une liste d'éléments au même format que le client (src/lib/types.ts).

import crypto from 'node:crypto'

const uid = () => crypto.randomBytes(6).toString('hex')

function builder() {
  let z = 1
  const els = []
  const add = (el) => {
    const full = { id: uid(), z: z++, ...el }
    els.push(full)
    return full
  }
  const center = (el) => ({ x: el.x + el.w / 2, y: el.y + el.h / 2 })
  return {
    els,
    note: (x, y, noteColor, text = '', w = 200, h = 200) =>
      add({ type: 'note', x, y, w, h, noteColor, fontSize: 18, text }),
    text: (x, y, text, { w = 420, fontSize = 18, color = 'ink' } = {}) =>
      add({ type: 'text', x, y, w, h: Math.round(fontSize * 1.35) + 4, color, fontSize, text }),
    shape: (type, x, y, w, h, { text = '', color = 'ink', fill = 'tint', strokeWidth = 2, dashed = false, fontSize = 18 } = {}) =>
      add({ type, x, y, w, h, color, fill, strokeWidth, dashed, fontSize, text }),
    arrow: (from, to, { color = 'ink', heads = 'end', dashed = false, strokeWidth = 2 } = {}) => {
      const a = center(from)
      const b = center(to)
      return add({
        type: 'arrow',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        color,
        strokeWidth,
        dashed,
        heads,
        start: { x: a.x, y: a.y, bind: from.id },
        end: { x: b.x, y: b.y, bind: to.id },
      })
    },
  }
}

const TEMPLATES = {
  blank: () => [],

  speedboat() {
    const t = builder()
    t.text(-640, -540, 'Rétro Speedboat', { w: 600, fontSize: 36 })
    t.shape('rect', -640, -40, 1340, 460, { color: 'cobalt', strokeWidth: 1 })

    const zones = [
      { x: -640, y: -440, w: 460, h: 300, color: 'green', title: 'Le vent : ce qui nous pousse' },
      { x: 300, y: -440, w: 400, h: 300, color: 'violet', title: 'L’île : notre objectif' },
      { x: -240, y: 80, w: 480, h: 310, color: 'red', title: 'Les ancres : ce qui nous freine' },
      { x: 280, y: 80, w: 400, h: 310, color: 'orange', title: 'Les rochers : les risques à venir' },
    ]
    const boxes = zones.map((z) => t.shape('rect', z.x, z.y, z.w, z.h, { color: z.color, fill: 'none', dashed: true }))
    const boat = t.shape('rect', -120, -110, 240, 90, { text: 'Notre équipe', color: 'ink', fill: 'solid', fontSize: 24 })
    t.arrow(boat, boxes[1], { color: 'violet', dashed: true })
    zones.forEach((z) => t.text(z.x + 16, z.y + 12, z.title, { w: z.w - 32, color: z.color }))
    return t.els
  },

  kanban() {
    const t = builder()
    t.text(-480, -400, 'Kanban', { w: 400, fontSize: 36 })
    const cols = ['À faire', 'En cours', 'Terminé']
    cols.forEach((title, i) => {
      const x = -480 + i * 330
      t.shape('rect', x, -320, 300, 660, { color: 'grey', strokeWidth: 1 })
      t.text(x + 18, -300, title, { w: 260, fontSize: 24 })
    })
    t.note(-440, -240, 'lemon', 'Glisse ce post-it vers « En cours » quand la tâche démarre', 220, 160)
    t.note(-440, -60, 'lemon', '', 220, 160)
    return t.els
  },

  brainstorm() {
    const t = builder()
    const mid = t.shape('ellipse', -150, -75, 300, 150, { text: 'Sujet central', color: 'cobalt', fill: 'solid', fontSize: 24 })
    const colors = ['lemon', 'pink', 'mint', 'sky', 'lilac', 'peach']
    colors.forEach((c, i) => {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / colors.length
      const n = t.note(Math.round(Math.cos(ang) * 430 - 90), Math.round(Math.sin(ang) * 300 - 90), c, '', 180, 180)
      t.arrow(mid, n, { color: 'grey', heads: 'none' })
    })
    return t.els
  },

  architecture() {
    const t = builder()
    t.text(-560, -300, 'Schéma d’architecture', { w: 600, fontSize: 36 })
    const nav = t.shape('rect', -560, -60, 200, 110, { text: 'Navigateur' })
    const front = t.shape('rect', -260, -60, 200, 110, { text: 'Front web' })
    const api = t.shape('rect', 40, -60, 200, 110, { text: 'API', color: 'cobalt' })
    const db = t.shape('ellipse', 360, -200, 220, 120, { text: 'Base de données', color: 'green' })
    const ext = t.shape('diamond', 380, 40, 180, 180, { text: 'Service externe', color: 'violet' })
    t.arrow(nav, front)
    t.arrow(front, api)
    t.arrow(api, db, { heads: 'both' })
    t.arrow(api, ext, { dashed: true })
    return t.els
  },
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES)

export function buildTemplate(key) {
  const make = TEMPLATES[key] || TEMPLATES.blank
  return make()
}
