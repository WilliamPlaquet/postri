import type { Box, Camera, Peer, Point } from '../lib/types'

interface Props {
  cam: Camera
  selection: Box[]
  group: Box | null
  /** poignées de redimensionnement (sélection simple, hors flèche) */
  resizable: Box | null
  arrowEnds: { a: Point; b: Point } | null
  marquee: Box | null
  bindTarget: Box | null
  peers: (Peer & { boxes: Box[] })[]
}

const toScreen = (b: Box, cam: Camera, pad = 0) => ({
  left: b.x * cam.zoom + cam.x - pad,
  top: b.y * cam.zoom + cam.y - pad,
  width: b.w * cam.zoom + pad * 2,
  height: b.h * cam.zoom + pad * 2,
})

const HANDLES = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as const

export function Overlay({ cam, selection, group, resizable, arrowEnds, marquee, bindTarget, peers }: Props) {
  return (
    <div className="overlay">
      {peers.map((p) =>
        p.boxes.map((b, i) => (
          <div
            key={`${p.clientId}-${i}`}
            className="peer-selection"
            style={{ ...toScreen(b, cam, 4), borderColor: p.user.color }}
          />
        )),
      )}

      {bindTarget && <div className="bind-target" style={toScreen(bindTarget, cam, 5)} />}

      {selection.map((b, i) => (
        <div key={i} className="sel-box" style={toScreen(b, cam, 3)} />
      ))}
      {group && <div className="sel-group" style={toScreen(group, cam, 8)} />}

      {resizable && (
        <div className="sel-frame" style={toScreen(resizable, cam, 3)}>
          {HANDLES.map((h) => (
            <div key={h} className={`handle handle-${h}`} data-handle={h} />
          ))}
        </div>
      )}

      {arrowEnds &&
        (['start', 'end'] as const).map((which) => {
          const p = which === 'start' ? arrowEnds.a : arrowEnds.b
          return (
            <div
              key={which}
              className="handle handle-point"
              data-handle={which}
              style={{ left: p.x * cam.zoom + cam.x, top: p.y * cam.zoom + cam.y }}
            />
          )
        })}

      {marquee && <div className="marquee" style={toScreen(marquee, cam)} />}

      {peers.map(
        (p) =>
          p.cursor && (
            <div
              key={p.clientId}
              className="peer-cursor"
              style={{
                transform: `translate(${p.cursor.x * cam.zoom + cam.x}px, ${p.cursor.y * cam.zoom + cam.y}px)`,
                color: p.user.color,
              }}
            >
              <svg width="18" height="20" viewBox="0 0 18 20">
                <path d="M1.5 1.5l14 8-6.3 1.6L6 18.5 1.5 1.5z" fill="currentColor" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span style={{ background: p.user.color }}>{p.user.name}</span>
            </div>
          ),
      )}
    </div>
  )
}
