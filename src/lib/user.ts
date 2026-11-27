import type { UserInfo } from './types'
import { PEOPLE_COLORS } from './constants'

const KEY = 'postri:user'

export function loadUser(): UserInfo | null {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (u && typeof u.name === 'string' && u.name.trim()) return u
  } catch {
    /* rien */
  }
  return null
}

export function saveUser(name: string, color?: string): UserInfo {
  const u: UserInfo = {
    name: name.trim().slice(0, 32),
    color: color || PEOPLE_COLORS[Math.floor(Math.random() * PEOPLE_COLORS.length)],
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(u))
  } catch {
    /* stockage indisponible : on garde en mémoire */
  }
  return u
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?'

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function storageSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* rien */
  }
}
