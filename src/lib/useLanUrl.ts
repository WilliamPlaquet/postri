import { useEffect, useState } from 'react'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1']
let cache: Promise<string[]> | null = null

/** Adresse à partager aux autres postes du réseau (remplace « localhost » par l'IP du PC) */
export function useLanUrl(path: string): string | null {
  const [base, setBase] = useState<string | null>(LOCAL_HOSTS.includes(location.hostname) ? null : location.origin)

  useEffect(() => {
    if (!LOCAL_HOSTS.includes(location.hostname)) return
    cache ??= fetch('/api/info')
      .then((r) => r.json())
      .then((d) => (Array.isArray(d.addresses) ? d.addresses : []))
      .catch(() => [])
    cache.then((ips) => {
      const ip = ips.find((a: string) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) ?? ips[0]
      setBase(ip ? `${location.protocol}//${ip}${location.port ? `:${location.port}` : ''}` : location.origin)
    })
  }, [])

  return base ? base + path : null
}
