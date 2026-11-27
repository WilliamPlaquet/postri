// Postri : application de bureau
// Démarre le serveur Postri dans l'application puis l'affiche dans une fenêtre.
// Les boards sont enregistrés dans le dossier de données de l'utilisateur
// (Windows : %APPDATA%\Postri\data).

import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {typeof import('../server/index.js') | null} */
let server = null
/** @type {BrowserWindow | null} */
let win = null
let port = 0
let quitting = false

// Une seule instance : relancer Postri remet la fenêtre existante au premier plan
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(boot)
}

async function boot() {
  process.env.POSTRI_DATA = path.join(app.getPath('userData'), 'data')
  process.env.POSTRI_DIST = path.join(here, '..', 'dist')
  process.env.PORT ||= '3210'

  try {
    server = await import('../server/index.js')
    port = await server.start({ allowFallback: true })
  } catch (e) {
    dialog.showErrorBox('Postri ne peut pas démarrer', String(e?.message || e))
    app.exit(1)
    return
  }

  if (app.isPackaged) Menu.setApplicationMenu(null)
  createWindow()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Postri',
    backgroundColor: '#F1F3F6',
    autoHideMenuBar: true,
    icon: path.join(here, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  })

  const local = `http://localhost:${port}`
  win.loadURL(local)

  // Les liens externes s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(local)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(local)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.on('closed', () => (win = null))
}

app.on('window-all-closed', () => app.quit())

// Avant de quitter : enregistrer les boards et fermer le tunnel
app.on('before-quit', async (event) => {
  if (quitting || !server) return
  event.preventDefault()
  quitting = true
  try {
    await server.saveAll()
  } finally {
    app.exit(0)
  }
})
