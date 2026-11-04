import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { iconDiscovered, iconFailed, iconHref, iconKey, iconLoaded, iconView, loadSiteIcons, siteIconCandidates } from '../product/favicon.ts'
import type { IconFetch, IconView } from '../product/favicon.ts'

const HTML_LIMIT = 200_000
const memory = new Map<string, { view: IconView; failed: string[] }>()

/** Read the public page for link rel=icon. Cookies and the desktop referrer are not sent. */
const browserIconFetch: IconFetch = async (url, init) => {
  const response = await fetch(url, {
    signal: init.signal,
    credentials: 'omit',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'text/html' },
  })
  const contentType = response.headers.get('content-type') ?? ''
  const html = /text\/html|application\/xhtml\+xml/i.test(contentType) || contentType.trim() === ''
  if (!html) await response.body?.cancel().catch(() => undefined)
  return {
    url: response.url,
    contentType,
    text: () => readLimited(response, HTML_LIMIT, init.signal),
    release: async () => { await response.body?.cancel().catch(() => undefined) },
  }
}

async function readLimited(response: Response, limit: number, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return (await response.text()).slice(0, limit)
  const parts: Uint8Array[] = []
  let total = 0
  try {
    while (total < limit) {
      if (signal.aborted) break
      const step = await reader.read()
      if (step.done || !step.value) break
      parts.push(step.value)
      total += step.value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const size = Math.min(total, limit)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    const take = Math.min(part.byteLength, size - offset)
    if (take <= 0) break
    bytes.set(part.subarray(0, take), offset)
    offset += take
  }
  return new TextDecoder().decode(bytes)
}

export function SiteFavicon({ entryUrl, fallback }: { entryUrl: string; fallback: ReactNode }) {
  const key = iconKey(entryUrl) ?? ''
  const [view, setView] = useState<IconView>(() => memory.get(key)?.view ?? iconView(siteIconCandidates(entryUrl)))
  const failed = useRef<string[]>(memory.get(key)?.failed ?? [])
  useEffect(() => {
    const saved = key ? memory.get(key) : undefined
    if (saved?.view.status === 'ready') {
      failed.current = saved.failed
      setView(saved.view)
      return
    }
    let alive = true
    failed.current = saved?.failed ?? []
    setView(saved?.view ?? iconView(siteIconCandidates(entryUrl)))
    if (!key) return () => { alive = false }
    loadSiteIcons(entryUrl, browserIconFetch).then(hrefs => {
      if (!alive) return
      setView(current => {
        const next = iconDiscovered(current, hrefs, failed.current)
        memory.set(key, { view: next, failed: failed.current })
        return next
      })
    }).catch(() => undefined)
    return () => { alive = false }
  }, [entryUrl, key])
  const href = iconHref(view)
  if (!href) return <span className="mark" data-erp-favicon="fallback">{fallback}</span>
  return <span className="mark" data-erp-favicon="site">
    <img
      src={href}
      alt=""
      width={18}
      height={18}
      draggable={false}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => {
        setView(current => {
          const next = iconLoaded(current)
          if (key) memory.set(key, { view: next, failed: failed.current })
          return next
        })
      }}
      onError={() => {
        setView(current => {
          if (current.status === 'loading') {
            const missed = current.hrefs[current.index]
            if (missed && !failed.current.includes(missed)) failed.current = [...failed.current, missed]
          }
          const next = iconFailed(current)
          if (key) memory.set(key, { view: next, failed: failed.current })
          return next
        })
      }}
    />
  </span>
}
