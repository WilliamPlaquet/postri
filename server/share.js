// Partage sur Internet : ouvre un tunnel Cloudflare (Quick Tunnel, sans compte)
// vers le serveur local. Les codes d'accès sont gérés par board dans index.js.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest/download/'

function binaryName() {
  const { platform, arch } = process
  if (platform === 'win32') return { asset: `cloudflared-windows-${arch === 'ia32' ? '386' : 'amd64'}.exe`, file: 'cloudflared.exe' }
  if (platform === 'linux') return { asset: `cloudflared-linux-${arch === 'arm64' ? 'arm64' : 'amd64'}`, file: 'cloudflared' }
  return null
}

/**
 * @param {{ binDir: string, getPort: () => number, onStop?: () => void }} opts
 */
export function createShareManager({ binDir, getPort, onStop }) {
  /** @type {{status:'off'|'downloading'|'starting'|'on'|'error', url:string|null, error:string|null}} */
  const state = { status: 'off', url: null, error: null }
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null

  async function findBinary() {
    // 1. binaire fourni avec l'application (installeur Windows)
    if (process.env.POSTRI_CLOUDFLARED && fs.existsSync(process.env.POSTRI_CLOUDFLARED)) return process.env.POSTRI_CLOUDFLARED
    const info = binaryName()
    if (!info) throw new Error('Le partage sur Internet est disponible sous Windows et Linux.')
    // 2. binaire déjà téléchargé
    const target = path.join(binDir, info.file)
    if (fs.existsSync(target)) return target
    // 3. téléchargement depuis les versions officielles de Cloudflare
    state.status = 'downloading'
    await fsp.mkdir(binDir, { recursive: true })
    const res = await fetch(RELEASES + info.asset)
    if (!res.ok || !res.body) throw new Error(`Téléchargement de cloudflared impossible (HTTP ${res.status}).`)
    const tmp = `${target}.download`
    await fsp.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
    await fsp.chmod(tmp, 0o755)
    await fsp.rename(tmp, target)
    return target
  }

  async function start() {
    if (state.status === 'on' || state.status === 'starting' || state.status === 'downloading') return
    state.error = null
    state.url = null
    try {
      const bin = await findBinary()
      state.status = 'starting'
      const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${getPort()}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      child = proc
      let log = ''
      const onData = (buf) => {
        const text = buf.toString()
        log = (log + text).slice(-4000)
        // l'adresse publique ressemble à https://mots-au-hasard.trycloudflare.com
        const m = text.match(/https:\/\/(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/i)
        if (m && child === proc && state.status !== 'on') {
          state.url = m[0]
          state.status = 'on'
        }
      }
      proc.stdout.on('data', onData)
      proc.stderr.on('data', onData)
      proc.on('error', (e) => {
        if (child !== proc) return
        child = null
        Object.assign(state, { status: 'error', url: null, error: `cloudflared n'a pas pu démarrer : ${e.message}` })
      })
      proc.on('exit', () => {
        if (child !== proc) return
        child = null
        // stop() remet child à null avant de tuer le processus : ici l'arrêt est inattendu
        const wasOn = state.status === 'on'
        Object.assign(state, {
          status: 'error',
          url: null,
          error: wasOn
            ? 'Le partage s’est interrompu (connexion à Internet perdue ?). Relance-le.'
            : `Le tunnel s'est arrêté avant d'être prêt. ${lastLine(log)}`.trim(),
        })
        onStop?.()
      })
      // pas d'adresse au bout de 40 s : on abandonne
      setTimeout(() => {
        if (child === proc && state.status === 'starting') {
          proc.kill()
          Object.assign(state, { status: 'error', error: "Cloudflare n'a pas répondu à temps. Vérifie ta connexion Internet." })
        }
      }, 40_000)
    } catch (e) {
      Object.assign(state, { status: 'error', url: null, error: e instanceof Error ? e.message : String(e) })
    }
  }

  function stop() {
    const proc = child
    child = null
    if (proc) proc.kill()
    Object.assign(state, { status: 'off', url: null, error: null })
    onStop?.()
  }

  return { state, start, stop }
}

function lastLine(log) {
  const lines = log.trim().split('\n').filter(Boolean)
  const line = lines[lines.length - 1] || ''
  return line.replace(/^\S+\s+(ERR|INF|WRN)\s+/, '').slice(0, 200)
}
