import { useEffect, useState } from 'react'
import type { UserInfo } from './lib/types'
import { loadUser, storageGet, storageSet } from './lib/user'
import { Home } from './components/Home'
import { Board } from './components/Board'
import { NameDialog } from './components/NameDialog'
import { AccessGate } from './components/Share'
import { SessionContext, fetchSession } from './lib/session'
import type { Session } from './lib/session'

type Route = { page: 'home' } | { page: 'board'; id: string }

function parseRoute(): Route {
  const m = location.hash.match(/^#\/b\/([a-z0-9-]+)/i)
  return m ? { page: 'board', id: m[1] } : { page: 'home' }
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [user, setUser] = useState<UserInfo | null>(loadUser)
  const [editUser, setEditUser] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    fetchSession().then(setSession)
  }, [])
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    storageGet('postri:theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    storageSet('postri:theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (!session) return null
  if (session.remote && !session.authorized) return <AccessGate onAccess={() => fetchSession().then(setSession)} />
  if (!user) return <NameDialog initial={null} onSave={setUser} />

  return (
    <SessionContext.Provider value={session}>
      {route.page === 'home' ? (
        <Home
          user={user}
          onOpen={(id) => (location.hash = `/b/${id}`)}
          onEditUser={() => setEditUser(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <Board
          key={route.id}
          boardId={route.id}
          user={user}
          onEditUser={() => setEditUser(true)}
          onHome={() => (location.hash = '/')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      {editUser && (
        <NameDialog
          initial={user}
          onSave={(u) => {
            setUser(u)
            setEditUser(false)
          }}
          onCancel={() => setEditUser(false)}
        />
      )}
    </SessionContext.Provider>
  )
}
