import { useEffect, useState } from 'react'
import { API_CHANNEL, API_ENDPOINT, PRODUCT_ENTRY, PRODUCT_PANEL } from '../product/names.ts'
import { openErpSite } from './open.ts'
import type { OpenSite } from './open.ts'

export { openErpSite } from './open.ts'
export { PRODUCT_ENTRY, PRODUCT_PANEL }

const NS = 'erp-assistant'
const zh: Record<string, string> = {
  entry: PRODUCT_ENTRY.zh,
  title: PRODUCT_ENTRY.zh,
  lede: '在右侧浏览器里手动登录。这里不收集密码。',
  name: '名称',
  url: '入口网址',
  account: '账户标签',
  accountHint: '只是标签，不是密码',
  add: '添加',
  open: '打开',
  remove: '移除',
  empty: '还没有站点。填写入口网址，打开后在右侧浏览器登录。',
  saved: '每个站点有自己的会话和本地索引。移除只是从列表拿掉，索引还留在这台机器上。',
  working: '正在打开…',
  channel: '还连不上桌面里的 ERP 助手。重启 dsh 后再试。',
  browser: '官方右侧浏览器还不可用。',
}
const en: Record<string, string> = {
  entry: PRODUCT_ENTRY.en,
  title: PRODUCT_ENTRY.en,
  lede: 'Sign in yourself in the browser on the right. Passwords are not collected.',
  name: 'Name',
  url: 'Entry URL',
  account: 'Account label',
  accountHint: 'A label, not a password',
  add: 'Add',
  open: 'Open',
  remove: 'Remove',
  empty: 'No sites yet. Add an entry URL, then sign in on the right.',
  saved: 'Each site keeps its own conversation and local index. Remove only takes it off this list.',
  working: 'Opening…',
  channel: 'ERP assistant is not connected yet. Restart dsh and try again.',
  browser: 'The official sidebar browser is not available yet.',
}

interface ClientCtx {
  effect(fn: () => (() => void) | void): void
  get(name: string): unknown
  locale: {
    register(ns: string, locale: string, dict: Record<string, string>): () => void
    bind(ns: string): (key: string) => string
  }
  slots: {
    inject(name: string, register: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
}

interface ListedSite extends OpenSite { name: string; account: string }

interface RpcResult { ok: boolean; value?: { sites: ListedSite[] }; error?: { message?: string } }

export const inject = ['slots', 'locale']

const STYLE = `
.erp-assistant{box-sizing:border-box;height:100%;overflow:auto;padding:28px 32px;color:var(--dsw-alias-label-primary,inherit);font:inherit}
.erp-assistant h1{margin:0 0 8px;font-size:22px;font-weight:600}
.erp-assistant .lede,.erp-assistant .note{margin:0 0 16px;max-width:42rem;color:var(--dsw-alias-label-secondary,inherit)}
.erp-assistant form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;margin:0 0 20px}
.erp-assistant label{display:grid;gap:4px;font-size:12px}
.erp-assistant input,.erp-assistant button{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-separator,rgba(127,127,127,.45));border-radius:8px;padding:8px 10px}
.erp-assistant button{cursor:pointer}
.erp-assistant ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.erp-assistant li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center}
.erp-assistant .meta{display:block;color:var(--dsw-alias-label-secondary,inherit);font-size:12px}
.erp-assistant .error{color:var(--dsw-alias-danger,inherit)}
`

function installStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  const style = document.createElement('style')
  style.setAttribute('data-erp-assistant', 'style')
  style.textContent = STYLE
  document.head.appendChild(style)
  return () => { style.remove() }
}

async function sitesOf(ctx: ClientCtx, payload: object): Promise<ListedSite[]> {
  const connection = ctx.get('connection') as { rpc?: { call(channel: string, endpoint: string, body: unknown): Promise<RpcResult> } } | undefined
  if (!connection?.rpc?.call) throw new Error('ERP_CHANNEL_UNAVAILABLE')
  const result = await connection.rpc.call(API_CHANNEL, API_ENDPOINT, payload)
  if (!result.ok || !result.value) throw new Error(result.error?.message ?? 'ERP_REQUEST_FAILED')
  return result.value.sites
}

function message(t: (key: string) => string, error: unknown): string {
  const text = error instanceof Error ? error.message : ''
  if (text === 'ERP_CHANNEL_UNAVAILABLE') return t('channel')
  if (text === 'ERP_BROWSER_UNAVAILABLE') return t('browser')
  if (text.startsWith('ERP_PASSWORD_REJECTED')) return t('lede')
  return text || t('channel')
}

function ErpIcon({ size = 16 }: { size?: number; active?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.2 6.2h11.6M6.2 6.2V13.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
}

function Guide({ ctx, t }: { ctx: ClientCtx; t: (key: string) => string }) {
  const [sites, setSites] = useState<ListedSite[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    sitesOf(ctx, { op: 'list' }).then(list => { if (alive) setSites(list) }, cause => { if (alive) setError(message(t, cause)) })
    return () => { alive = false }
  }, [ctx, t])
  async function add(event: { preventDefault(): void }) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const list = await sitesOf(ctx, { op: 'add', url, ...(name.trim() ? { name: name.trim() } : {}), ...(account.trim() ? { account: account.trim() } : {}) })
      setSites(list)
      setName('')
      setUrl('')
      setAccount('')
    } catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function open(site: ListedSite) {
    setBusy(true)
    setError('')
    try {
      const layout = ctx.get('layout') as { selectPanel(id: string | null): void } | undefined
      const sessions = ctx.get('sessions') as { create(input: { cwd: string }): Promise<string> } | undefined
      const uiWorkspace = ctx.get('uiWorkspace') as { openSession(id: string): void } | undefined
      const sidebar = ctx.get('sidebarRight') as { openTab(kind: 'browser', options: { params: { url: string } }): void; mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } } | undefined
      const workspaces = ctx.get('workspaces') as { create(input: { path: string }): Promise<unknown> } | undefined
      if (!layout || !sessions || !uiWorkspace || !sidebar) throw new Error('ERP_BROWSER_UNAVAILABLE')
      await openErpSite({
        layout, sessions, uiWorkspace, sidebar, ...(workspaces ? { workspaces } : {}),
        bind: async (siteId, sessionId) => { await sitesOf(ctx, { op: 'bind', siteId, sessionId }) },
      }, site)
    } catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    setError('')
    try { setSites(await sitesOf(ctx, { op: 'remove', id })) }
    catch (cause) { setError(message(t, cause)) }
  }
  return <section className="erp-assistant" data-dsh-plugin="@guosheng_047/dsh-erp" data-erp-assistant="guide">
    <h1>{t('title')}</h1>
    <p className="lede">{t('lede')}</p>
    <form onSubmit={event => { void add(event) }} autoComplete="off">
      <label>{t('name')}<input value={name} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
      <label>{t('url')}<input value={url} onChange={event => setUrl(event.target.value)} type="url" inputMode="url" required autoComplete="url" /></label>
      <label>{t('account')}<input value={account} onChange={event => setAccount(event.target.value)} autoComplete="off" placeholder={t('accountHint')} /></label>
      <button type="submit" disabled={busy || !url.trim()}>{t('add')}</button>
    </form>
    {error ? <p className="error">{error}</p> : null}
    {sites.length === 0 ? <p className="note">{t('empty')}</p> : <ul>
      {sites.map(site => <li key={site.id}>
        <span><strong>{site.name}</strong><span className="meta">{site.account} · {site.entryUrl}</span></span>
        <button type="button" disabled={busy} onClick={() => { void open(site) }}>{busy ? t('working') : t('open')}</button>
        <button type="button" onClick={() => { void remove(site.id) }}>{t('remove')}</button>
      </li>)}
    </ul>}
    <p className="note">{t('saved')}</p>
  </section>
}

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => ctx.locale.register(NS, 'zh', zh))
  ctx.effect(() => ctx.locale.register(NS, 'en', en))
  ctx.effect(installStyle)
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PRODUCT_PANEL, order: 8, locale: NS, label: () => t('entry'),
  }, ErpIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PRODUCT_PANEL, locale: NS,
  }, function ErpGuide(props: { t?: (key: string) => string }) {
    return <Guide ctx={ctx} t={props.t ?? t} />
  }))
}
