import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ArrowEnd, BoardElement, Box, Camera, ElementType, Peer, Point, Tool, UserInfo } from '../lib/types'
import type { ColorKey, FillMode, FontSize, NoteColor, StrokeWidth, ArrowHeads } from '../lib/types'
import { useBoard, useConnection } from '../lib/useBoard'
import type { Connection } from '../lib/useBoard'
import {
  bindableAt,
  boxesIntersect,
  elementBox,
  isBindable,
  normalizeBox,
  resolveArrow,
  screenToWorld,
  uid,
  unionBox,
} from '../lib/geometry'
import { GRID, MAX_ZOOM, MIN_ZOOM, TOOLS } from '../lib/constants'
import { storageGet, storageSet } from '../lib/user'
import { ArrowView, DrawView, NoteView, ShapeView, TextView } from './ElementView'
import { Overlay } from './Overlay'
import { Inspector } from './Inspector'
import { BottomBar, HelpPanel, TopBar, Toolbar } from './Chrome'
import { AccessGate } from './Share'

/* ------------------------------------------------------------------ */

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | {
      kind: 'move'
      start: Point
      ids: string[]
      originals: Record<string, BoardElement>
      arrows: Record<string, { a: Point; b: Point }>
      moved: boolean
      clickSelect?: string
    }
  | { kind: 'resize'; id: string; handle: string; original: BoardElement }
  | { kind: 'marquee'; start: Point; base: string[] }
  | { kind: 'create'; id: string; start: Point }
  | { kind: 'arrow-end'; id: string; which: 'start' | 'end'; isNew: boolean }
  | { kind: 'draw'; id: string; pts: number[] }

interface StyleDefaults {
  noteColor: NoteColor
  color: ColorKey
  fill: FillMode
  strokeWidth: StrokeWidth
  fontSize: FontSize
  dashed: boolean
  heads: ArrowHeads
}

const DEFAULT_STYLE: StyleDefaults = {
  noteColor: 'lemon',
  color: 'ink',
  fill: 'tint',
  strokeWidth: 2,
  fontSize: 18,
  dashed: false,
  heads: 'end',
}

const TEXT_TYPES = new Set<ElementType>(['note', 'text', 'rect', 'ellipse', 'diamond'])
const SHAPE_TOOLS = new Set<Tool>(['rect', 'ellipse', 'diamond'])
const CLIP_MARK = 'postri/elements'

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')

function useLatest<T>(v: T) {
  const r = useRef(v)
  r.current = v
  return r
}

/* ------------------------------------------------------------------ */

interface Props {
  boardId: string
  user: UserInfo
  onEditUser: () => void
  onHome: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Board(props: Props) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'locked'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    fetch(`/api/boards/${props.boardId}`, { cache: 'no-store' })
      .then((r) => setState(r.ok ? 'ok' : r.status === 401 ? 'locked' : 'missing'))
      .catch(() => setState('ok')) // serveur injoignable : on laisse la reconnexion faire
  }, [props.boardId, attempt])

  if (state === 'locked') {
    return <AccessGate boardId={props.boardId} onAccess={() => setAttempt((n) => n + 1)} onHome={props.onHome} />
  }
  if (state === 'missing') {
    return (
      <div className="notfound">
        <h1>Ce board n’existe pas</h1>
        <p className="muted">Il a peut-être été supprimé, ou le lien est incomplet.</p>
        <button className="btn primary" onClick={props.onHome}>
          Voir tous les boards
        </button>
      </div>
    )
  }
  if (state === 'loading') return <div className="notfound muted">Ouverture du board…</div>
  return <Connected {...props} />
}

function Connected(props: Props) {
  const conn = useConnection(props.boardId)
  if (!conn) return <div className="notfound muted">Ouverture du board…</div>
  return <Canvas key={conn.doc.guid} {...props} conn={conn} />
}

function Canvas({ boardId, user, onEditUser, onHome, theme, onToggleTheme, conn }: Props & { conn: Connection }) {
  const { api, elements, name, status, synced, peers, canUndo, canRedo } = useBoard(conn, user)

  const camKey = `postri:cam:${boardId}`
  const savedCam = useMemo(() => storageGet<Camera | null>(camKey, null), [camKey])
  const [cam, setCam] = useState<Camera>(savedCam ?? { x: innerWidth / 2, y: innerHeight / 2, zoom: 1 })
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [hoverBind, setHoverBind] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [help, setHelp] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [style, setStyle] = useState<StyleDefaults>(() => ({ ...DEFAULT_STYLE, ...storageGet('postri:style', {}) }))

  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const lastWorld = useRef<Point>({ x: 0, y: 0 })

  const sorted = useMemo(
    () => Object.values(elements).sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1)),
    [elements],
  )

  const camRef = useLatest(cam)
  const toolRef = useLatest(tool)
  const selectedRef = useLatest(selected)
  const editingRef = useLatest(editing)
  const sortedRef = useLatest(sorted)
  const elementsRef = useLatest(elements)
  const styleRef = useLatest(style)
  const spaceRef = useLatest(spaceDown)

  /* ---------------- caméra ---------------- */

  useEffect(() => {
    const t = setTimeout(() => storageSet(camKey, cam), 300)
    return () => clearTimeout(t)
  }, [cam, camKey])

  const zoomAt = useCallback((factor: number, screen?: Point) => {
    setCam((c) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor))
      const p = screen ?? { x: innerWidth / 2, y: innerHeight / 2 }
      const k = zoom / c.zoom
      return { zoom, x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k }
    })
  }, [])

  const fitTo = useCallback((box: Box | null) => {
    if (!box) {
      setCam({ x: innerWidth / 2, y: innerHeight / 2, zoom: 1 })
      return
    }
    const padX = Math.min(120, innerWidth * 0.08)
    const padY = Math.min(140, innerHeight * 0.12)
    const zoom = Math.min(1.5, Math.max(MIN_ZOOM, Math.min((innerWidth - padX * 2) / Math.max(box.w, 1), (innerHeight - padY * 2) / Math.max(box.h, 1))))
    setCam({
      zoom,
      x: innerWidth / 2 - (box.x + box.w / 2) * zoom,
      y: innerHeight / 2 - (box.y + box.h / 2) * zoom,
    })
  }, [])

  const fitAll = useCallback(() => {
    fitTo(unionBox(sortedRef.current.map((el) => elementBox(el, elementsRef.current))))
  }, [fitTo, sortedRef, elementsRef])

  // Première ouverture : on cadre le contenu existant
  const didFit = useRef(!!savedCam)
  useEffect(() => {
    if (synced && !didFit.current) {
      didFit.current = true
      if (sorted.length) fitAll()
    }
  }, [synced, sorted.length, fitAll])

  const toWorld = useCallback((e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current!.getBoundingClientRect()
    return screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, camRef.current)
  }, [camRef])

  /* ---------------- sélection & présence ---------------- */

  useEffect(() => {
    setSelected((s) => {
      const next = s.filter((id) => elements[id])
      return next.length === s.length ? s : next
    })
    if (editing && !elements[editing]) setEditing(null)
  }, [elements, editing])

  useEffect(() => {
    api.setPresence({ selection: selected, editing })
  }, [api, selected, editing])

  const cursorFrame = useRef(0)
  const sendCursor = (p: Point | null) => {
    cancelAnimationFrame(cursorFrame.current)
    cursorFrame.current = requestAnimationFrame(() => api.setPresence({ cursor: p }))
  }

  /* ---------------- création ---------------- */

  const nextZ = () => (sortedRef.current.length ? sortedRef.current[sortedRef.current.length - 1].z + 1 : 1)

  const make = (type: ElementType, box: Box, extra: Partial<BoardElement> = {}): BoardElement => {
    const s = styleRef.current
    const base: BoardElement = { id: uid(), type, ...box, z: nextZ() }
    switch (type) {
      case 'note':
        return { ...base, noteColor: s.noteColor, fontSize: s.fontSize, text: '', ...extra }
      case 'text':
        return { ...base, color: s.color, fontSize: s.fontSize, text: '', ...extra }
      case 'rect':
      case 'ellipse':
      case 'diamond':
        return { ...base, color: s.color, fill: s.fill, strokeWidth: s.strokeWidth, dashed: s.dashed, fontSize: s.fontSize, text: '', ...extra }
      case 'arrow':
        return { ...base, color: s.color, strokeWidth: s.strokeWidth, dashed: s.dashed, heads: s.heads, ...extra }
      case 'draw':
        return { ...base, color: s.color, strokeWidth: s.strokeWidth, ...extra }
    }
  }

  const createNoteAt = (p: Point) => {
    const el = make('note', { x: p.x - 100, y: p.y - 100, w: 200, h: 200 })
    api.set(el)
    setSelected([el.id])
    setEditing(el.id)
  }

  /* ---------------- copier / coller ---------------- */

  const serialize = (ids: string[]) => {
    const set = new Set(ids)
    // inclure les flèches dont les deux extrémités sont copiées
    sortedRef.current.forEach((el) => {
      if (el.type === 'arrow' && el.start?.bind && el.end?.bind && set.has(el.start.bind) && set.has(el.end.bind)) set.add(el.id)
    })
    return sortedRef.current
      .filter((el) => set.has(el.id))
      .map((el) => {
        if (el.type !== 'arrow') return el
        const { a, b } = resolveArrow(el, elementsRef.current)
        return { ...el, start: { ...el.start, x: a.x, y: a.y }, end: { ...el.end, x: b.x, y: b.y } }
      })
  }

  const insert = (els: BoardElement[], target: Point | null, offset = 0) => {
    if (!els.length) return
    const box = unionBox(els.map((el) => elementBox(el, Object.fromEntries(els.map((e) => [e.id, e])))))!
    const dx = target ? target.x - (box.x + box.w / 2) : offset
    const dy = target ? target.y - (box.y + box.h / 2) : offset
    const ids = new Map(els.map((el) => [el.id, uid()]))
    let z = nextZ()
    const moveEnd = (e: ArrowEnd | undefined): ArrowEnd | undefined => {
      if (!e) return e
      const bind = e.bind && ids.get(e.bind)
      return bind ? { x: e.x + dx, y: e.y + dy, bind } : { x: e.x + dx, y: e.y + dy }
    }
    const fresh = els.map((el) => ({
      ...el,
      id: ids.get(el.id)!,
      x: el.x + dx,
      y: el.y + dy,
      z: z++,
      start: moveEnd(el.start),
      end: moveEnd(el.end),
      createdBy: user.name,
    }))
    api.checkpoint()
    api.transact(() => fresh.forEach((el) => api.set(el)))
    setSelected(fresh.map((el) => el.id))
  }

  const duplicate = () => insert(serialize(selectedRef.current), null, 24)

  /* ---------------- ordre & suppression ---------------- */

  const bringToFront = () => {
    let z = nextZ()
    api.checkpoint()
    api.transact(() => sortedRef.current.filter((el) => selectedRef.current.includes(el.id)).forEach((el) => api.patch(el.id, { z: z++ })))
  }
  const sendToBack = () => {
    const list = sortedRef.current
    let z = (list.length ? list[0].z : 0) - selectedRef.current.length
    api.checkpoint()
    api.transact(() => list.filter((el) => selectedRef.current.includes(el.id)).forEach((el) => api.patch(el.id, { z: z++ })))
  }
  const deleteSelected = () => {
    if (!selectedRef.current.length) return
    api.remove(selectedRef.current)
    setSelected([])
    setEditing(null)
  }

  const applyStyle = (changes: Partial<BoardElement>) => {
    api.checkpoint()
    api.transact(() => selectedRef.current.forEach((id) => api.patch(id, changes)))
    const next = { ...styleRef.current, ...(changes as Partial<StyleDefaults>) }
    setStyle(next)
    storageSet('postri:style', next)
  }

  /* ---------------- texte ---------------- */

  const onText = useCallback((id: string, text: string) => api.patch(id, { text }), [api])
  const onEditEnd = useCallback(
    (id: string) => {
      const el = api.get(id)
      if (el?.type === 'text' && !(el.text || '').trim()) api.remove([id])
      api.checkpoint()
      setEditing((cur) => (cur === id ? null : cur))
    },
    [api],
  )
  const onMeasure = useCallback((id: string, h: number) => api.patch(id, { h }), [api])

  /* ---------------- pointeur ---------------- */

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    const world = toWorld(e)
    const target = e.target as Element

    // fin d'édition si on clique ailleurs
    if (editingRef.current && !target.closest(`[data-id="${editingRef.current}"]`)) {
      ;(document.activeElement as HTMLElement | null)?.blur()
    }

    if (e.button === 1 || spaceRef.current || toolRef.current === 'hand') {
      e.preventDefault()
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camRef.current }
      setPanning(true)
      return
    }

    const t = toolRef.current

    if (t === 'select') {
      const handle = target.closest('[data-handle]')?.getAttribute('data-handle')
      if (handle && selectedRef.current.length === 1) {
        const id = selectedRef.current[0]
        const el = api.get(id)
        if (!el) return
        api.beginGesture()
        if (handle === 'start' || handle === 'end') {
          dragRef.current = { kind: 'arrow-end', id, which: handle, isNew: false }
        } else {
          dragRef.current = { kind: 'resize', id, handle, original: el }
        }
        return
      }

      const id = target.closest('[data-id]')?.getAttribute('data-id')
      if (id && elementsRef.current[id]) {
        if (editingRef.current === id) return
        let ids = selectedRef.current
        let clickSelect: string | undefined
        if (e.shiftKey) {
          ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
          setSelected(ids)
          if (!ids.includes(id)) return
        } else if (!ids.includes(id)) {
          ids = [id]
          setSelected(ids)
        } else if (ids.length > 1) {
          clickSelect = id
        }
        const originals: Record<string, BoardElement> = {}
        const arrows: Record<string, { a: Point; b: Point }> = {}
        ids.forEach((i) => {
          const el = elementsRef.current[i]
          if (!el) return
          originals[i] = el
          if (el.type === 'arrow') arrows[i] = resolveArrow(el, elementsRef.current)
        })
        dragRef.current = { kind: 'move', start: world, ids, originals, arrows, moved: false, clickSelect }
        return
      }

      const base = e.shiftKey ? selectedRef.current : []
      if (!e.shiftKey) setSelected([])
      dragRef.current = { kind: 'marquee', start: world, base }
      return
    }

    if (t === 'note') {
      createNoteAt(world)
      setTool('select')
      return
    }

    if (t === 'text') {
      const el = make('text', { x: world.x, y: world.y - 14, w: 260, h: 30 })
      api.set(el)
      setSelected([el.id])
      setEditing(el.id)
      setTool('select')
      return
    }

    api.beginGesture()

    if (SHAPE_TOOLS.has(t)) {
      const el = make(t as ElementType, { x: world.x, y: world.y, w: 0, h: 0 })
      api.set(el)
      setSelected([el.id])
      dragRef.current = { kind: 'create', id: el.id, start: world }
      return
    }

    if (t === 'arrow') {
      const hit = e.altKey ? undefined : bindableAt(world, sortedRef.current)
      const start: ArrowEnd = hit ? { x: world.x, y: world.y, bind: hit.id } : { x: world.x, y: world.y }
      const el = make('arrow', { x: world.x, y: world.y, w: 0, h: 0 }, { start, end: { x: world.x, y: world.y } })
      api.set(el)
      setSelected([el.id])
      dragRef.current = { kind: 'arrow-end', id: el.id, which: 'end', isNew: true }
      return
    }

    if (t === 'draw') {
      const el = make('draw', { x: world.x, y: world.y, w: 1, h: 1 }, { points: [0, 0], vw: 1, vh: 1 })
      api.set(el)
      dragRef.current = { kind: 'draw', id: el.id, pts: [world.x, world.y] }
    }
  }

  useEffect(() => {
    let frame = 0
    let lastEvent: PointerEvent | null = null

    const process = () => {
      frame = 0
      const e = lastEvent
      const d = dragRef.current
      if (!e || !d) return
      const world = toWorld(e)

      switch (d.kind) {
        case 'pan':
          setCam({ ...d.cam, x: d.cam.x + e.clientX - d.sx, y: d.cam.y + e.clientY - d.sy })
          break

        case 'move': {
          const dx = world.x - d.start.x
          const dy = world.y - d.start.y
          if (!d.moved) {
            if (Math.hypot(dx, dy) * camRef.current.zoom < 3) return
            d.moved = true
            api.beginGesture()
          }
          const moving = new Set(d.ids)
          api.transact(() => {
            d.ids.forEach((id) => {
              const o = d.originals[id]
              if (!o || !api.get(id)) return
              if (o.type === 'arrow') {
                const r = d.arrows[id]
                const shift = (end: ArrowEnd | undefined, resolved: Point): ArrowEnd => {
                  if (end?.bind && moving.has(end.bind)) return { ...end, x: end.x + dx, y: end.y + dy }
                  return { x: resolved.x + dx, y: resolved.y + dy }
                }
                api.patch(id, { start: shift(o.start, r.a), end: shift(o.end, r.b) })
              } else {
                api.patch(id, { x: o.x + dx, y: o.y + dy })
              }
            })
          })
          break
        }

        case 'resize': {
          const o = d.original
          let x1 = o.x
          let y1 = o.y
          let x2 = o.x + o.w
          let y2 = o.y + o.h
          if (d.handle.includes('w')) x1 = world.x
          if (d.handle.includes('e')) x2 = world.x
          if (d.handle.includes('n')) y1 = world.y
          if (d.handle.includes('s')) y2 = world.y
          if (e.shiftKey && d.handle.length === 2 && o.w > 0 && o.h > 0) {
            const ratio = o.w / o.h
            let w = Math.abs(x2 - x1)
            let h = Math.abs(y2 - y1)
            if (w / h > ratio) h = w / ratio
            else w = h * ratio
            if (d.handle.includes('w')) x1 = x2 - w
            else x2 = x1 + w
            if (d.handle.includes('n')) y1 = y2 - h
            else y2 = y1 + h
          }
          const min = o.type === 'text' ? 40 : 16
          const b = normalizeBox({ x: x1, y: y1 }, { x: x2, y: y2 })
          api.patch(d.id, { x: b.x, y: b.y, w: Math.max(b.w, min), h: Math.max(b.h, o.type === 'text' ? o.h : min) })
          break
        }

        case 'marquee': {
          const box = normalizeBox(d.start, world)
          setMarquee(box)
          const hits = sortedRef.current.filter((el) => boxesIntersect(elementBox(el, elementsRef.current), box)).map((el) => el.id)
          setSelected(Array.from(new Set([...d.base, ...hits])))
          break
        }

        case 'create': {
          let w = world.x - d.start.x
          let h = world.y - d.start.y
          if (e.shiftKey) {
            const m = Math.max(Math.abs(w), Math.abs(h))
            w = Math.sign(w || 1) * m
            h = Math.sign(h || 1) * m
          }
          api.patch(d.id, normalizeBox(d.start, { x: d.start.x + w, y: d.start.y + h }))
          break
        }

        case 'arrow-end': {
          const el = api.get(d.id)
          if (!el) return
          const other = d.which === 'start' ? el.end : el.start
          const hit = e.altKey ? undefined : bindableAt(world, sortedRef.current, other?.bind)
          setHoverBind(hit?.id ?? null)
          const end: ArrowEnd = hit ? { x: world.x, y: world.y, bind: hit.id } : { x: world.x, y: world.y }
          api.patch(d.id, { [d.which]: end })
          break
        }

        case 'draw': {
          const n = d.pts.length
          if (Math.hypot(world.x - d.pts[n - 2], world.y - d.pts[n - 1]) * camRef.current.zoom < 2) return
          d.pts.push(world.x, world.y)
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          for (let i = 0; i < d.pts.length; i += 2) {
            minX = Math.min(minX, d.pts[i])
            maxX = Math.max(maxX, d.pts[i])
            minY = Math.min(minY, d.pts[i + 1])
            maxY = Math.max(maxY, d.pts[i + 1])
          }
          const w = Math.max(maxX - minX, 1)
          const h = Math.max(maxY - minY, 1)
          const points = d.pts.map((v, i) => Math.round((v - (i % 2 ? minY : minX)) * 10) / 10)
          api.patch(d.id, { x: minX, y: minY, w, h, vw: w, vh: h, points })
          break
        }
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      lastEvent = e
      if (!frame) frame = requestAnimationFrame(process)
    }

    const onUp = () => {
      if (frame) {
        cancelAnimationFrame(frame)
        process()
      }
      lastEvent = null
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      switch (d.kind) {
        case 'pan':
          setPanning(false)
          break
        case 'move':
          if (d.moved) api.endGesture()
          else if (d.clickSelect) setSelected([d.clickSelect])
          break
        case 'resize':
          api.endGesture()
          break
        case 'marquee':
          setMarquee(null)
          break
        case 'create': {
          const el = api.get(d.id)
          if (el && el.w < 8 && el.h < 8) {
            const w = el.type === 'diamond' ? 150 : 170
            const h = el.type === 'diamond' ? 150 : el.type === 'ellipse' ? 120 : 110
            api.patch(d.id, { x: d.start.x - w / 2, y: d.start.y - h / 2, w, h })
          }
          api.endGesture()
          setTool('select')
          break
        }
        case 'arrow-end': {
          setHoverBind(null)
          const el = api.get(d.id)
          if (el && d.isNew) {
            const { a, b } = resolveArrow(el, elementsRef.current)
            if (Math.hypot(a.x - b.x, a.y - b.y) < 10) {
              // simple clic : flèche par défaut vers la droite
              const s = el.start!
              api.patch(d.id, { end: { x: (s.bind ? a.x : s.x) + 160, y: s.bind ? a.y : s.y } })
            }
            setTool('select')
          }
          api.endGesture()
          break
        }
        case 'draw':
          api.endGesture()
          break
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      cancelAnimationFrame(frame)
    }
  }, [api, toWorld, camRef, sortedRef, elementsRef])

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (toolRef.current !== 'select') return
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id')
    const el = id ? elementsRef.current[id] : undefined
    if (el && TEXT_TYPES.has(el.type)) {
      setSelected([el.id])
      setEditing(el.id)
    } else if (!id && !(e.target as Element).closest('.overlay [data-handle]')) {
      createNoteAt(toWorld(e))
    }
  }

  /* ---------------- molette ---------------- */

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('.panel, .dialog')) return
      e.preventDefault()
      const r = node.getBoundingClientRect()
      const p = { x: e.clientX - r.left, y: e.clientY - r.top }
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        zoomAt(Math.exp(-delta * 0.0025 * (e.ctrlKey && !e.metaKey && Math.abs(delta) < 50 ? 2.5 : 1)), p)
      } else {
        const k = e.deltaMode === 1 ? 16 : 1
        const dx = e.shiftKey && !e.deltaX ? e.deltaY * k : e.deltaX * k
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY * k
        setCam((c) => ({ ...c, x: c.x - dx, y: c.y - dy }))
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /* ---------------- clavier ---------------- */

  const handlersRef = useLatest({ duplicate, deleteSelected, bringToFront, sendToBack, fitAll, zoomAt, serialize, insert })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const h = handlersRef.current
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (e.key === ' ' && !e.repeat) {
        e.preventDefault()
        setSpaceDown(true)
        return
      }
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) api.redo()
        else api.undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        api.redo()
        return
      }
      if (mod && k === 'd') {
        e.preventDefault()
        h.duplicate()
        return
      }
      if (mod && k === 'a') {
        e.preventDefault()
        setSelected(sortedRef.current.map((el) => el.id))
        return
      }
      if (mod && (k === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault()
        setCam((c) => {
          const p = { x: innerWidth / 2, y: innerHeight / 2 }
          const k2 = 1 / c.zoom
          return { zoom: 1, x: p.x - (p.x - c.x) * k2, y: p.y - (p.y - c.y) * k2 }
        })
        return
      }
      if (mod) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        h.deleteSelected()
        return
      }
      if (e.key === 'Escape') {
        setSelected([])
        setTool('select')
        setHelp(false)
        return
      }
      if (e.key === 'Enter' && selectedRef.current.length === 1) {
        const el = elementsRef.current[selectedRef.current[0]]
        if (el && TEXT_TYPES.has(el.type)) {
          e.preventDefault()
          setEditing(el.id)
        }
        return
      }
      if (e.key.startsWith('Arrow') && selectedRef.current.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        api.transact(() =>
          selectedRef.current.forEach((id) => {
            const el = api.get(id)
            if (!el) return
            if (el.type === 'arrow') {
              const { a, b } = resolveArrow(el, elementsRef.current)
              const mv = (end: ArrowEnd | undefined, p: Point): ArrowEnd =>
                end?.bind && selectedRef.current.includes(end.bind) ? { ...end, x: end.x + dx, y: end.y + dy } : { x: p.x + dx, y: p.y + dy }
              api.patch(id, { start: mv(el.start, a), end: mv(el.end, b) })
            } else api.patch(id, { x: el.x + dx, y: el.y + dy })
          }),
        )
        return
      }
      if (e.key === ']') return h.bringToFront()
      if (e.key === '[') return h.sendToBack()
      if (e.key === '+' || e.key === '=') return h.zoomAt(1.2)
      if (e.key === '-') return h.zoomAt(1 / 1.2)
      if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) return h.fitAll()
      if (e.key === '?') return setHelp((v) => !v)
      if (e.altKey) return
      const t = TOOLS.find((x) => x.key.toLowerCase() === k)
      if (t) setTool(t.tool)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false)
    }
    const onBlur = () => setSpaceDown(false)

    const onCopy = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || !selectedRef.current.length) return
      const els = handlersRef.current.serialize(selectedRef.current)
      e.clipboardData?.setData('text/plain', JSON.stringify({ type: CLIP_MARK, elements: els }))
      e.preventDefault()
      if (e.type === 'cut') {
        api.remove(selectedRef.current)
        setSelected([])
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return
      e.preventDefault()
      try {
        const data = JSON.parse(text)
        if (data?.type === CLIP_MARK && Array.isArray(data.elements)) {
          handlersRef.current.insert(data.elements, lastWorld.current)
          return
        }
      } catch {
        /* texte brut */
      }
      const p = lastWorld.current
      const el = make('note', { x: p.x - 100, y: p.y - 100, w: 200, h: 200 }, { text: text.slice(0, 2000) })
      api.set(el)
      setSelected([el.id])
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      document.removeEventListener('paste', onPaste)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  /* ---------------- export / import ---------------- */

  const exportJson = () => {
    const data = { app: 'postri', version: 1, name, exportedAt: new Date().toISOString(), elements: serialize(sorted.map((el) => el.id)) }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(name || 'board').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'board'}.postri.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const els: BoardElement[] = Array.isArray(data) ? data : data.elements
      if (!Array.isArray(els)) throw new Error()
      const valid = els.filter((el) => el && typeof el.id === 'string' && typeof el.type === 'string' && typeof el.x === 'number')
      const center = screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 }, camRef.current)
      insert(valid, center)
      showToast(`${valid.length} élément${valid.length > 1 ? 's' : ''} importé${valid.length > 1 ? 's' : ''}`)
    } catch {
      showToast('Ce fichier n’est pas un export Postri valide.')
    }
  }

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  const follow = (p: Peer) => {
    if (!p.cursor) {
      showToast(`${p.user.name} n’a pas son curseur sur le board.`)
      return
    }
    setCam((c) => ({ ...c, x: innerWidth / 2 - p.cursor!.x * c.zoom, y: innerHeight / 2 - p.cursor!.y * c.zoom }))
  }

  /* ---------------- rendu ---------------- */

  const selectedEls = selected.map((id) => elements[id]).filter(Boolean)
  const selBoxes = selectedEls.map((el) => elementBox(el, elements))
  const single = selectedEls.length === 1 ? selectedEls[0] : null
  const peerViews = peers.map((p) => ({
    ...p,
    boxes: (p.selection || []).filter((id) => elements[id]).map((id) => elementBox(elements[id], elements)),
  }))
  const bindTarget = hoverBind && isBindable(elements[hoverBind]) ? elementBox(elements[hoverBind], elements) : null
  const editingByPeer = new Map<string, Peer>()
  peers.forEach((p) => p.editing && editingByPeer.set(p.editing, p))

  const gridSize = GRID * cam.zoom
  const viewportStyle: CSSProperties = {
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: `${cam.x}px ${cam.y}px`,
    cursor: panning ? 'grabbing' : spaceDown || tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
  }

  return (
    <div className="board">
      <div
        ref={viewportRef}
        className={`viewport${cam.zoom < 0.45 ? ' grid-faint' : ''} tool-${tool}`}
        style={viewportStyle}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onPointerMove={(e) => {
          const w = toWorld(e)
          lastWorld.current = w
          sendCursor(w)
        }}
        onPointerLeave={() => sendCursor(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}>
          {sorted.map((el) => {
            const isEditing = editing === el.id
            const measure = el.type === 'text' && (isEditing || selected.includes(el.id)) ? onMeasure : undefined
            const peer = editingByPeer.get(el.id)
            let node: ReactNode
            switch (el.type) {
              case 'note':
                node = <NoteView key={el.id} el={el} editing={isEditing} onText={onText} onEditEnd={onEditEnd} />
                break
              case 'text':
                node = <TextView key={el.id} el={el} editing={isEditing} onText={onText} onEditEnd={onEditEnd} onMeasure={measure} />
                break
              case 'rect':
              case 'ellipse':
              case 'diamond':
                node = <ShapeView key={el.id} el={el} editing={isEditing} onText={onText} onEditEnd={onEditEnd} />
                break
              case 'arrow': {
                const { a, b } = resolveArrow(el, elements)
                node = <ArrowView key={el.id} el={el} a={a} b={b} />
                break
              }
              case 'draw':
                node = <DrawView key={el.id} el={el} />
                break
            }
            if (!peer) return node
            return [
              node,
              <div
                key={`${el.id}-typing`}
                className="typing-badge"
                style={{ transform: `translate(${el.x}px, ${el.y - 26}px)`, background: peer.user.color }}
              >
                {peer.user.name} écrit…
              </div>,
            ]
          })}
        </div>

        <Overlay
          cam={cam}
          selection={selectedEls.length > 1 ? selBoxes : []}
          group={selectedEls.length > 1 ? unionBox(selBoxes) : null}
          resizable={single && single.type !== 'arrow' && !editing ? selBoxes[0] : null}
          arrowEnds={single && single.type === 'arrow' ? resolveArrow(single, elements) : null}
          marquee={marquee}
          bindTarget={bindTarget}
          peers={peerViews}
        />

      </div>

      <TopBar
        boardId={boardId}
        name={name}
        onRename={api.setName}
        status={status}
        synced={synced}
        peers={peers}
        user={user}
        onEditUser={onEditUser}
        onHome={onHome}
        onFollow={follow}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onExport={exportJson}
        onImport={importJson}
      />

      <Toolbar tool={tool} onTool={setTool} />

      {selectedEls.length > 0 && !marquee && (
        <Inspector
          elements={selectedEls}
          onChange={applyStyle}
          onFront={bringToFront}
          onBack={sendToBack}
          onDuplicate={duplicate}
          onDelete={deleteSelected}
        />
      )}

      <BottomBar
        zoom={cam.zoom}
        onZoom={(f) => zoomAt(f)}
        onReset={() => zoomAt(1 / cam.zoom)}
        onFit={fitAll}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={api.undo}
        onRedo={api.redo}
        onHelp={() => setHelp(true)}
      />

      {status === 'disconnected' && (
        <div className="banner" role="status">
          Connexion au serveur perdue. Tu peux continuer : tes changements seront envoyés à la reconnexion.
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {help && <HelpPanel onClose={() => setHelp(false)} />}
    </div>
  )
}

