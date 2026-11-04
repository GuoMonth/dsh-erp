import { useEffect, useState } from 'react'
import { API_CHANNEL, API_ENDPOINT, PRODUCT_ENTRY, PRODUCT_PANEL } from '../product/names.ts'
import { resumeTarget } from '../product/resume.ts'
import { normalizeBookmark } from '../product/bookmark.ts'
import { entryIssue } from '../product/wizard.ts'
import { ensureWorkspace, openErpSite } from './open.ts'
import type { OpenSite } from './open.ts'

export { ensureWorkspace, openErpSite } from './open.ts'
export { PRODUCT_ENTRY, PRODUCT_PANEL }

const NS = 'erp-assistant'
const zh: Record<string, string> = {
  entry: PRODUCT_ENTRY.zh,
  title: PRODUCT_ENTRY.zh,
  lede: '在右侧浏览器里自己登录。这里只保存书签，不保存密码。',
  firstRun: '还没有站点。粘贴 ERP 网址，显示名可以留空。登录留在右侧浏览器。',
  returning: '继续上次打开的站点，或从列表里打开另一个。每个站点有自己的工作区文件夹和本地索引。',
  name: '显示名',
  nameHint: '可留空，默认用主机名',
  url: '网址',
  add: '添加',
  save: '保存',
  cancel: '取消',
  edit: '编辑',
  open: '打开',
  continue: '继续',
  continueHint: '恢复该站点的对话，并在右侧浏览器打开入口。登录由你自己完成。',
  explore: '一键探索',
  newChat: '新对话',
  explorePaused: '还看不到已登录界面，探索已暂停。登录后在对话里继续这一轮。未完成的范围不会标成完成。',
  explorePartial: '探索已开始，这一轮还没有走完。已有结果可以读，未完成的范围保持未完成。',
  exploreRound: '这一轮的前沿已经结束。覆盖率只描述这一轮。',
  share: '分享',
  importPack: '导入分享包',
  imported: '已导入分享包，记录待复核。导入不授予登录或写入权限。',
  packInvalid: '这份分享包无法读取。请换一份 schemaVersion 1 的 zip，或检查文件是否完整。',
  remove: '移除',
  empty: '还没有站点。粘贴网址，打开后在右侧浏览器登录。',
  firstHint: '粘贴 http 或 https 地址。深链会整理成站点入口。账号和密码不会保存。',
  editHint: '改显示名不会换成另一个站点。更换成另一个 ERP 会另起一份索引，已绑定的对话不会被挪过去。',
  saved: '添加站点时会建立它的工作区文件夹。移除只是从列表拿掉，索引还留在这台机器上。',
  working: '正在打开…',
  channel: '还连不上桌面里的 ERP 助手。重启 dsh 后再试。',
  browser: '官方右侧浏览器还不可用。',
  password: '不能提交密码。请在右侧浏览器里自己登录。',
  urlInvalid: '网址需要是 http 或 https。',
  baseRequired: '这个地址不能整理成站点入口。',
}
const en: Record<string, string> = {
  entry: PRODUCT_ENTRY.en,
  title: PRODUCT_ENTRY.en,
  lede: 'Sign in yourself in the browser on the right. This page stores the bookmark, not a password.',
  firstRun: 'No sites yet. Paste the ERP URL. The display name can stay empty. Sign in on the right.',
  returning: 'Continue the site you opened last, or open another from the list. Each site keeps its own workspace folder and local index.',
  name: 'Display name',
  nameHint: 'Optional. Defaults to the host name',
  url: 'URL',
  add: 'Add',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  open: 'Open',
  continue: 'Continue',
  continueHint: 'Restore this site\'s conversation and open its entry on the right. Sign in yourself.',
  explore: 'Start exploring',
  newChat: 'New chat',
  explorePaused: 'The logged-in page is not visible yet, so exploration is paused. Continue the round from the conversation after you sign in. Unfinished scope stays unfinished.',
  explorePartial: 'Exploration has started and this round is not finished. Partial results stay readable.',
  exploreRound: 'This round\'s frontier is finished. Coverage describes this round only.',
  share: 'Share',
  importPack: 'Import pack',
  imported: 'The pack was imported for review. It grants no login or write permission.',
  packInvalid: 'This share pack cannot be read. Use a schemaVersion 1 zip and check that the file is intact.',
  remove: 'Remove',
  empty: 'No sites yet. Paste a URL, then sign in on the right.',
  firstHint: 'Paste an http or https address. A deep link is reduced to the site entry. Account details and passwords are not stored.',
  editHint: 'Renaming keeps this site. A different ERP starts another index, and conversations already bound are not moved.',
  saved: 'Adding a site creates its workspace folder. Remove only takes it off this list.',
  working: 'Opening…',
  channel: 'ERP assistant is not connected yet. Restart dsh and try again.',
  browser: 'The official sidebar browser is not available yet.',
  password: 'A password cannot be submitted. Sign in yourself in the browser on the right.',
  urlInvalid: 'The URL must be http or https.',
  baseRequired: 'This address cannot be reduced to a site entry.',
}

interface ClientCtx {
  effect(fn: () => (() => void) | void): void
  get(name: string): unknown
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    bind(ns: string): (key: string) => string
  }
  slots: {
    inject(name: string, register: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
}

interface ListedSite extends OpenSite { name: string }
interface ExploreStatus { state: string; pausedUntilLogin: boolean; complete: boolean }
interface GuideValue { sites: ListedSite[]; lastOpenedId?: string; explore?: ExploreStatus; pack?: { fileName: string; bytes: string }; imported?: { warnings: string[] } }
interface RpcResult { ok: boolean; value?: GuideValue; error?: { message?: string } }

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
.erp-assistant li{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto auto;gap:8px;align-items:center}
.erp-assistant .actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 16px}
.erp-assistant .meta{display:block;color:var(--dsw-alias-label-secondary,inherit);font-size:12px}
.erp-assistant .continue{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 20px;padding:12px 14px;border:1px solid var(--dsw-alias-separator,rgba(127,127,127,.45));border-radius:8px}
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

async function guideOf(ctx: ClientCtx, payload: object): Promise<GuideValue> {
  const connection = ctx.get('connection') as { rpc?: { call(channel: string, endpoint: string, body: unknown): Promise<RpcResult> } } | undefined
  if (!connection?.rpc?.call) throw new Error('ERP_CHANNEL_UNAVAILABLE')
  const result = await connection.rpc.call(API_CHANNEL, API_ENDPOINT, payload)
  if (!result.ok || !result.value) throw new Error(result.error?.message ?? 'ERP_REQUEST_FAILED')
  return result.value
}

function message(t: (key: string) => string, error: unknown): string {
  const text = error instanceof Error ? error.message : ''
  const code = text.split(':')[0] ?? ''
  if (code === 'ERP_CHANNEL_UNAVAILABLE') return t('channel')
  if (code === 'ERP_BROWSER_UNAVAILABLE') return t('browser')
  if (code === 'ERP_PASSWORD_REJECTED' || code === 'credentials') return t('password')
  if (code.startsWith('SHARE_PACK_')) return t('packInvalid')
  if (code === 'INVALID_ENTRY_URL' || code === 'INVALID_SITE_URL' || code === 'url' || code === 'query' || code === 'empty') return t('urlInvalid')
  if (code === 'ERP_BASE_URL_REQUIRED' || code === 'ERP_BASE_URL_MUST_END_IN_SLASH' || code === 'ERP_ENTRY_OUTSIDE_BASE_URL' || code === 'slash') return t('baseRequired')
  return text || t('channel')
}

function ErpIcon({ size = 16 }: { size?: number; active?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.2 6.2h11.6M6.2 6.2V13.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
}

function exploreNote(t: (key: string) => string, explore: ExploreStatus): string {
  if (explore.pausedUntilLogin) return t('explorePaused')
  if (!explore.complete) return t('explorePartial')
  return t('exploreRound')
}

function downloadPack(fileName: string, bytes: string): void {
  const binary = atob(bytes)
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([data], { type: 'application/zip' }))
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

async function encodeFile(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  if (data.byteLength > 16_000_000) throw new Error('SHARE_PACK_LIMIT')
  let binary = ''
  for (let index = 0; index < data.length; index += 0x8000) binary += String.fromCharCode(...data.subarray(index, index + 0x8000))
  return btoa(binary)
}

function Guide({ ctx, t }: { ctx: ClientCtx; t: (key: string) => string }) {
  const [sites, setSites] = useState<ListedSite[]>([])
  const [lastOpenedId, setLastOpenedId] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  function applyGuide(value: GuideValue) {
    setSites(value.sites)
    setLastOpenedId(value.lastOpenedId ?? '')
    if (value.explore) setStatus(exploreNote(t, value.explore))
    if (value.imported) setStatus(value.imported.warnings.length ? `${t('imported')} ${value.imported.warnings.join(' ')}` : t('imported'))
    if (value.pack) downloadPack(value.pack.fileName, value.pack.bytes)
  }
  function clearForm() {
    setEditing('')
    setName('')
    setUrl('')
  }
  function workspaces() {
    return ctx.get('workspaces') as { create(input: { path: string }): Promise<unknown> } | undefined
  }
  useEffect(() => {
    let alive = true
    guideOf(ctx, { op: 'list' }).then(value => { if (alive) applyGuide(value) }, cause => { if (alive) setError(message(t, cause)) })
    return () => { alive = false }
  }, [ctx, t])
  async function submit(event: { preventDefault(): void }) {
    event.preventDefault()
    const issue = entryIssue(url)
    if (issue) { setError(message(t, new Error(issue))); return }
    const bookmark = normalizeBookmark(url)
    setBusy(true)
    setError('')
    const fields = { url: bookmark.entryUrl, ...(name.trim() ? { name: name.trim() } : editing ? { name: '' } : {}) }
    try {
      const value = await guideOf(ctx, editing ? { op: 'update', id: editing, ...fields } : { op: 'add', ...fields })
      applyGuide(value)
      if (!editing) {
        const created = value.sites.find(site => site.entryUrl === bookmark.entryUrl)
        if (created) await ensureWorkspace(workspaces(), created.workspaceDir)
      }
      clearForm()
    } catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function open(site: ListedSite, fresh = false) {
    setBusy(true)
    setError('')
    try {
      const layout = ctx.get('layout') as { selectPanel(id: string | null): void } | undefined
      const sessions = ctx.get('sessions') as { create(input: { cwd: string }): Promise<string> } | undefined
      const uiWorkspace = ctx.get('uiWorkspace') as { openSession(id: string): void } | undefined
      const sidebar = ctx.get('sidebarRight') as { openTab(kind: 'browser', options: { params: { url: string } }): void; mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } } | undefined
      const hostWorkspaces = workspaces()
      if (!layout || !sessions || !uiWorkspace || !sidebar) throw new Error('ERP_BROWSER_UNAVAILABLE')
      await openErpSite({
        layout, sessions, uiWorkspace, sidebar, ...(hostWorkspaces ? { workspaces: hostWorkspaces } : {}),
        bind: async (siteId, sessionId) => { await guideOf(ctx, { op: 'bind', siteId, sessionId }) },
      }, site, fresh ? { fresh: true } : undefined)
      applyGuide(await guideOf(ctx, { op: 'opened', id: site.id }))
    } catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    setError('')
    try {
      applyGuide(await guideOf(ctx, { op: 'remove', id }))
      if (editing === id) clearForm()
    } catch (cause) { setError(message(t, cause)) }
  }
  function edit(site: ListedSite) {
    setEditing(site.id)
    setName(site.name)
    setUrl(site.entryUrl)
    setError('')
  }
  async function explore(site: ListedSite) {
    setBusy(true)
    setError('')
    try { applyGuide(await guideOf(ctx, { op: 'explore', id: site.id })) }
    catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function share(site: ListedSite) {
    setBusy(true)
    setError('')
    try { applyGuide(await guideOf(ctx, { op: 'export-pack', id: site.id })) }
    catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function importPack(site: ListedSite, file: File) {
    setBusy(true)
    setError('')
    try {
      const bytes = await encodeFile(file)
      applyGuide(await guideOf(ctx, { op: 'import-pack', id: site.id, bytes }))
    } catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  const firstRun = sites.length === 0
  const current = resumeTarget(sites, lastOpenedId)
  return <section className="erp-assistant" data-dsh-plugin="@guosheng_047/dsh-erp" data-erp-assistant={firstRun ? 'first-run' : 'returning'}>
    <h1>{t('title')}</h1>
    <p className="lede">{firstRun ? t('firstRun') : t('returning')}</p>
    {current && !firstRun ? <div className="continue">
      <span><strong>{current.name}</strong><span className="meta">{current.entryUrl}</span><span className="meta">{t('continueHint')}</span></span>
      <button type="button" disabled={busy} onClick={() => { void open(current) }}>{busy ? t('working') : t('continue')}</button>
    </div> : null}
    {current?.sessionId ? <div className="actions">
      <button type="button" disabled={busy} onClick={() => { void open(current, true) }}>{t('newChat')}</button>
      <button type="button" disabled={busy} onClick={() => { void explore(current) }}>{t('explore')}</button>
      <button type="button" disabled={busy} onClick={() => { void share(current) }}>{t('share')}</button>
      <label>{t('importPack')}<input type="file" accept=".zip,application/zip" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void importPack(current, file)
      }} /></label>
    </div> : null}
    <form onSubmit={event => { void submit(event) }} autoComplete="off">
      <label>{t('url')}<input value={url} onChange={event => setUrl(event.target.value)} type="url" inputMode="url" required autoComplete="off" /></label>
      <label>{t('name')}<input value={name} onChange={event => setName(event.target.value)} autoComplete="off" placeholder={t('nameHint')} /></label>
      <button type="submit" disabled={busy || !url.trim()}>{editing ? t('save') : t('add')}</button>
      {editing ? <button type="button" onClick={clearForm}>{t('cancel')}</button> : null}
    </form>
    {error ? <p className="error">{error}</p> : null}
    {status ? <p className="note">{status}</p> : null}
    {firstRun ? <p className="note">{t('firstHint')}</p> : <>
      <ul>
        {sites.map(site => <li key={site.id}>
          <span><strong>{site.name}</strong><span className="meta">{site.entryUrl}</span></span>
          <button type="button" disabled={busy} onClick={() => { void open(site) }}>{busy ? t('working') : t('open')}</button>
          <button type="button" disabled={busy} onClick={() => { void share(site) }}>{t('share')}</button>
          <button type="button" onClick={() => { edit(site) }}>{t('edit')}</button>
          <button type="button" onClick={() => { void remove(site.id) }}>{t('remove')}</button>
        </li>)}
      </ul>
      <p className="note">{editing ? t('editHint') : t('saved')}</p>
    </>}
  </section>
}

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
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
