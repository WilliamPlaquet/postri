// Postri — serveur collaboratif
// - Sert l'application compilée (dossier dist/)
// - Synchronise les boards en temps réel (Yjs sur WebSocket, chemin /ws/<id>)
// - Sauvegarde chaque board dans data/<id>.bin et l'index dans data/boards.json
// - Peut ouvrir un tunnel public (Partager sur Internet) protégé par un code d'accès
//
// Lancé directement (npm start) il démarre tout seul ; l'application de bureau
// l'importe et appelle start().

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { buildTemplate } from './templates.js'
import { createShareManager } from './share.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = process.env.POSTRI_DIST ? path.resolve(process.env.POSTRI_DIST) : path.join(ROOT, 'dist')
const DATA = process.env.POSTRI_DATA ? path.resolve(process.env.POSTRI_DATA) : path.join(ROOT, 'data')
const INDEX_FILE = path.join(DATA, 'boards.json')
let PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'

const MSG_SYNC = 0
const MSG_AWARENESS = 1
const MSG_QUERY_AWARENESS = 3

fs.mkdirSync(DATA, { recursive: true })

/* ------------------------------------------------------------------ */
/* Index des boards                                                    */
/* ------------------------------------------------------------------ */

/** @type {Record<string, {id:string,name:string,createdAt:number,updatedAt:number,count:number}>} */
let index = {}
try {
  index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
} catch {
  index = {}
}

let indexTimer = null
function saveIndexSoon() {
  clearTimeout(indexTimer)
  indexTimer = setTimeout(() => {
    writeAtomic(INDEX_FILE, JSON.stringify(index, null, 2)).catch((e) => console.error('[index]', e))
  }, 300)
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, data)
  await fsp.rename(tmp, file)
}

const isValidId = (id) => typeof id === 'string' && /^[a-z0-9-]{4,48}$/i.test(id)
const boardFile = (id) => path.join(DATA, `${id}.bin`)

function newId() {
  return crypto.randomBytes(5).toString('hex')
}

/* ------------------------------------------------------------------ */
/* Rooms (un Y.Doc par board)                                          */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {Y.Doc} doc
 * @property {awarenessProtocol.Awareness} awareness
 * @property {Map<import('ws').WebSocket, Set<number>>} conns
 * @property {NodeJS.Timeout|null} saveTimer
 * @property {NodeJS.Timeout|null} unloadTimer
 * @property {boolean} deleted
 */

/** @type {Map<string, Room>} */
const rooms = new Map()

function send(conn, message) {
  if (conn.readyState !== conn.OPEN) return
  try {
    conn.send(message, (err) => err && conn.close())
  } catch {
    conn.close()
  }
}

function getRoom(id) {
  let room = rooms.get(id)
  if (room) {
    if (room.unloadTimer) {
      clearTimeout(room.unloadTimer)
      room.unloadTimer = null
    }
    return room
  }

  const doc = new Y.Doc()
  try {
    const buf = fs.readFileSync(boardFile(id))
    Y.applyUpdate(doc, new Uint8Array(buf))
  } catch {
    /* board neuf */
  }

  const awareness = new awarenessProtocol.Awareness(doc)
  awareness.setLocalState(null)

  room = { id, doc, awareness, conns: new Map(), saveTimer: null, unloadTimer: null, deleted: false }
  rooms.set(id, room)

  doc.on('update', (update) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    const msg = encoding.toUint8Array(encoder)
    room.conns.forEach((_, conn) => send(conn, msg))
    scheduleSave(room)
  })

  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed)
    if (origin && room.conns.has(origin)) {
      const controlled = room.conns.get(origin)
      added.forEach((c) => controlled.add(c))
      removed.forEach((c) => controlled.delete(c))
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
    const msg = encoding.toUint8Array(encoder)
    room.conns.forEach((_, conn) => send(conn, msg))
  })

  return room
}

function scheduleSave(room) {
  if (room.saveTimer) return
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null
    saveRoom(room)
  }, 800)
}

async function saveRoom(room) {
  if (room.deleted) return
  const update = Y.encodeStateAsUpdate(room.doc)
  try {
    await writeAtomic(boardFile(room.id), update)
  } catch (e) {
    console.error(`[save ${room.id}]`, e)
    return
  }
  const meta = room.doc.getMap('meta')
  const prev = index[room.id]
  index[room.id] = {
    ...prev,
    id: room.id,
    name: String(meta.get('name') || prev?.name || 'Board sans titre'),
    createdAt: prev?.createdAt || Date.now(),
    updatedAt: Date.now(),
    count: room.doc.getMap('elements').size,
  }
  saveIndexSoon()
}

function maybeUnload(room) {
  if (room.conns.size > 0) return
  room.unloadTimer = setTimeout(async () => {
    if (room.conns.size > 0) return
    if (room.saveTimer) {
      clearTimeout(room.saveTimer)
      room.saveTimer = null
      await saveRoom(room)
    }
    room.doc.destroy()
    rooms.delete(room.id)
  }, 30_000)
}

/* ------------------------------------------------------------------ */
/* WebSocket                                                           */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (conn, req, roomId) => {
  conn.binaryType = 'arraybuffer'
  conn.isRemote = isRemote(req)
  conn.isGuest = !isHostUser(req)
  const room = getRoom(roomId)
  room.conns.set(conn, new Set())

  conn.on('message', (data) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data))
      const encoder = encoding.createEncoder()
      const type = decoding.readVarUint(decoder)
      if (type === MSG_SYNC) {
        encoding.writeVarUint(encoder, MSG_SYNC)
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn)
        if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn)
      } else if (type === MSG_QUERY_AWARENESS) {
        sendAwareness(conn, room)
      }
    } catch (e) {
      console.error('[ws message]', e)
    }
  })

  let alive = true
  conn.on('pong', () => (alive = true))
  const ping = setInterval(() => {
    if (!alive) {
      conn.terminate()
      return
    }
    alive = false
    try {
      conn.ping()
    } catch {
      conn.terminate()
    }
  }, 30_000)

  conn.on('close', () => {
    clearInterval(ping)
    const controlled = room.conns.get(conn)
    room.conns.delete(conn)
    if (controlled && controlled.size) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlled), null)
    }
    maybeUnload(room)
  })

  // Étape 1 de la synchro : on envoie notre état au client
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MSG_SYNC)
  syncProtocol.writeSyncStep1(encoder, room.doc)
  send(conn, encoding.toUint8Array(encoder))
  sendAwareness(conn, room)
})

function sendAwareness(conn, room) {
  const states = room.awareness.getStates()
  if (states.size === 0) return
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MSG_AWARENESS)
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
  )
  send(conn, encoding.toUint8Array(encoder))
}

/* ------------------------------------------------------------------ */
/* HTTP : API + fichiers statiques                                     */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function lanAddresses() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address)
    }
  }
  return out
}

/** champs d'un board montrés aux clients (jamais le code d'accès) */
const publicBoard = (b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, count: b.count })

function listBoards() {
  // Les rooms ouvertes ont peut-être un nom plus récent que l'index
  for (const room of rooms.values()) {
    const entry = index[room.id]
    if (entry) entry.name = String(room.doc.getMap('meta').get('name') || entry.name)
  }
  return Object.values(index).sort((a, b) => b.updatedAt - a.updatedAt)
}

/* ------------------------------------------------------------------ */
/* Qui peut faire quoi                                                 */
/*                                                                     */
/* - L'hôte (la personne devant le PC qui fait tourner Postri) peut    */
/*   tout faire : créer, supprimer, partager, voir tous les boards.    */
/* - Tous les autres (réseau local ou lien Internet) sont des invités : */
/*   chaque board a son propre code d'accès, et un code n'ouvre que    */
/*   ce board. Les invités ne créent ni ne suppriment de boards.       */
/* ------------------------------------------------------------------ */

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** requête arrivée par le tunnel Cloudflare */
function isRemote(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase()
  return Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray']) || host.endsWith('.trycloudflare.com')
}

/** la personne assise devant le PC qui héberge */
function isHostUser(req) {
  if (isRemote(req)) return false
  if (!LOOPBACK.has(req.socket.remoteAddress || '')) return false
  // en développement, Vite relaie les requêtes et indique l'adresse d'origine
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()
  return !fwd || LOOPBACK.has(fwd)
}

const clientIp = (req) =>
  String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?')

// Clé secrète des jetons d'accès, gardée entre deux lancements
const SECRET_FILE = path.join(DATA, 'secret.key')
let secret
try {
  secret = fs.readFileSync(SECRET_FILE)
  if (secret.length < 32) throw new Error()
} catch {
  secret = crypto.randomBytes(32)
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 })
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newCode() {
  const chars = Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`
}

/** code d'accès du board (créé à la première demande) */
function boardCode(id) {
  const entry = index[id]
  if (!entry) return null
  if (!entry.code) {
    entry.code = newCode()
    saveIndexSoon()
  }
  return entry.code
}

const cookieName = (id) => `postri_b_${id}`
const tokenFor = (id, code) => crypto.createHmac('sha256', secret).update(`${id}:${code}`).digest('base64url')

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '')
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return ''
}

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** l'hôte, ou un invité qui a saisi le code de ce board */
function canAccessBoard(req, id) {
  if (isHostUser(req)) return true
  const entry = index[id]
  if (!entry || !entry.code) return false
  return safeEqual(readCookie(req, cookieName(id)), tokenFor(id, entry.code))
}

/** déconnecte les invités d'un board (nouveau code) */
function kickGuests(id) {
  const room = rooms.get(id)
  if (room) room.conns.forEach((_, c) => c.isGuest && c.close(4401, 'code changé'))
}

const attempts = new Map()
function tooManyAttempts(req) {
  const ip = clientIp(req)
  const now = Date.now()
  const a = attempts.get(ip)
  if (!a || a.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 5 * 60_000 })
    return false
  }
  a.count++
  return a.count > 8
}

/* ------------------------------------------------------------------ */
/* Partage sur Internet (tunnel)                                       */
/* ------------------------------------------------------------------ */

const share = createShareManager({
  binDir: path.join(DATA, 'bin'),
  getPort: () => PORT,
  // tunnel coupé : les invités venus par Internet sont déconnectés
  onStop: () => {
    for (const room of rooms.values()) room.conns.forEach((_, c) => c.isRemote && c.close(4401, 'partage arrêté'))
  },
})

const HOST_ONLY = { error: 'Seul le PC qui héberge Postri peut faire ça.' }
const NEED_CODE = { error: 'Code d’accès requis', needsCode: true }

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean) // ['api', ...]
  const host = isHostUser(req)

  if (parts[1] === 'session' && req.method === 'GET') {
    return json(res, 200, { host, remote: isRemote(req) })
  }

  if (parts[1] === 'share') {
    if (!host) return json(res, 403, HOST_ONLY)
    if (req.method === 'POST' && parts[2] === 'start') share.start() // asynchrone : le client suit l'état
    else if (req.method === 'POST' && parts[2] === 'stop') share.stop()
    else if (req.method !== 'GET') return json(res, 404, { error: 'Route inconnue' })
    return json(res, 200, share.state)
  }

  if (parts[1] === 'info' && req.method === 'GET') {
    return json(res, 200, { port: PORT, addresses: host ? lanAddresses() : [] })
  }

  if (parts[1] === 'boards') {
    const id = parts[2]

    // liste : tout pour l'hôte, seulement les boards déverrouillés pour un invité
    if (!id && req.method === 'GET') {
      const list = listBoards().filter((b) => host || canAccessBoard(req, b.id))
      return json(res, 200, list.map((b) => ({ ...publicBoard(b), online: onlineCount(b.id), people: peopleOn(b.id) })))
    }

    if (!id && req.method === 'POST') {
      if (!host) return json(res, 403, HOST_ONLY)
      const body = await readBody(req)
      const name = String(body.name || '').trim().slice(0, 80) || 'Board sans titre'
      let boardId = newId()
      while (index[boardId]) boardId = newId()
      const room = getRoom(boardId)
      room.doc.transact(() => {
        room.doc.getMap('meta').set('name', name)
        const elements = room.doc.getMap('elements')
        for (const el of buildTemplate(String(body.template || 'blank'))) elements.set(el.id, el)
      })
      await saveRoom(room)
      maybeUnload(room)
      return json(res, 201, publicBoard(index[boardId]))
    }

    if (!id || !isValidId(id)) return json(res, 404, { error: 'Route inconnue' })
    const sub = parts[3]

    // un invité saisit le code du board
    if (sub === 'access' && req.method === 'POST') {
      if (tooManyAttempts(req)) return json(res, 429, { error: 'Trop d’essais. Réessaie dans quelques minutes.' })
      const body = await readBody(req)
      const entry = index[id]
      const clean = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!entry || !entry.code || !safeEqual(clean, entry.code.replace('-', ''))) {
        return json(res, 401, { error: 'Ce code ne correspond pas. Vérifie-le auprès de la personne qui t’a invité.' })
      }
      const secure = isRemote(req) ? '; Secure' : ''
      res.setHeader('Set-Cookie', `${cookieName(id)}=${tokenFor(id, entry.code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`)
      return json(res, 200, { ok: true })
    }

    // code d'invitation du board (hôte)
    if (sub === 'invite') {
      if (!host) return json(res, 403, HOST_ONLY)
      if (!index[id]) return json(res, 404, { error: "Ce board n'existe pas." })
      if (req.method === 'POST') {
        index[id].code = newCode()
        saveIndexSoon()
        kickGuests(id)
      }
      return json(res, 200, { code: boardCode(id) })
    }

    if (!sub && req.method === 'GET') {
      if (!index[id]) return json(res, host ? 404 : 401, host ? { error: "Ce board n'existe pas ou a été supprimé." } : NEED_CODE)
      if (!canAccessBoard(req, id)) return json(res, 401, NEED_CODE)
      const b = listBoards().find((x) => x.id === id)
      return json(res, 200, { ...publicBoard(b), online: onlineCount(id) })
    }

    if (!sub && req.method === 'DELETE') {
      if (!host) return json(res, 403, HOST_ONLY)
      const room = rooms.get(id)
      if (room) {
        room.deleted = true
        room.conns.forEach((_, c) => c.close(4404, 'board supprimé'))
        room.doc.destroy()
        rooms.delete(id)
      }
      delete index[id]
      saveIndexSoon()
      await fsp.rm(boardFile(id), { force: true })
      return json(res, 200, { ok: true })
    }
  }

  json(res, 404, { error: 'Route inconnue' })
}

function peopleOn(id) {
  const room = rooms.get(id)
  if (!room) return []
  const out = []
  room.awareness.getStates().forEach((s) => {
    if (s && s.user && typeof s.user.name === 'string') {
      out.push({ name: String(s.user.name).slice(0, 32), color: String(s.user.color || '#8a94a6').slice(0, 16) })
    }
  })
  return out
}

function onlineCount(id) {
  const room = rooms.get(id)
  if (!room) return 0
  let n = 0
  room.awareness.getStates().forEach((s) => s && s.user && n++)
  return n
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  if (rel.endsWith('/')) rel += 'index.html'
  let file = path.normalize(path.join(DIST, rel))
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end()
    return
  }
  try {
    const stat = await fsp.stat(file)
    if (stat.isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = path.join(DIST, 'index.html') // routes de l'application
  }
  try {
    const data = await fsp.readFile(file)
    const ext = path.extname(file)
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(data)
  } catch {
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    res.end(
      '<!doctype html><meta charset="utf-8"><title>Postri</title><body style="font-family:system-ui;padding:40px">' +
        "<h1>L'application n'est pas encore compilée</h1><p>Lance <code>npm run build</code> puis <code>npm start</code>, " +
        'ou utilise <code>npm run dev</code> pendant le développement.</p>',
    )
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    return await serveStatic(req, res, url)
  } catch (e) {
    console.error('[http]', e)
    if (!res.headersSent) json(res, 500, { error: 'Erreur interne du serveur' })
  }
})

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const match = url.pathname.match(/^\/ws\/([^/]+)$/)
  if (!match || !isValidId(match[1]) || !index[match[1]]) {
    socket.destroy()
    return
  }
  if (!canAccessBoard(req, match[1])) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, match[1]))
})

/** Démarre le serveur. Si le port est pris et que allowFallback est vrai, prend un port libre. */
export function start({ allowFallback = false } = {}) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      PORT = server.address().port
      console.log(`\n  Postri tourne sur http://localhost:${PORT}`)
      for (const ip of lanAddresses()) console.log(`  Sur ton réseau :  http://${ip}:${PORT}`)
      console.log(`  Données : ${DATA}\n`)
      resolve(PORT)
    }
    server.once('error', (e) => {
      if (allowFallback && e.code === 'EADDRINUSE') {
        server.listen(0, HOST, onListening)
      } else reject(e)
    })
    server.listen(PORT, HOST, onListening)
  })
}

/** Enregistre tout et coupe le tunnel (avant de quitter) */
export async function saveAll() {
  share.stop()
  await Promise.all(
    [...rooms.values()].map((r) => {
      if (r.saveTimer) clearTimeout(r.saveTimer)
      return saveRoom(r)
    }),
  )
  clearTimeout(indexTimer)
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2))
  } catch {}
}

// Lancement direct : node server/index.js
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  start().catch((e) => {
    console.error(e.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé. Ferme l'autre Postri ou lance avec PORT=3001.` : e)
    process.exit(1)
  })
  const quit = async () => {
    await saveAll()
    process.exit(0)
  }
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
}
