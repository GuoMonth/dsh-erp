import { useEffect, useRef, useState } from 'react'
import { API_CHANNEL, API_ENDPOINT, PRODUCT_ENTRY, PRODUCT_PANEL } from '../product/names.ts'
import { resumeTarget } from '../product/resume.ts'
import { normalizeBookmark } from '../product/bookmark.ts'
import { entryIssue } from '../product/wizard.ts'
import { SiteFavicon } from './favicon.tsx'
import { ensureWorkspace, openErpSite, watchWorkspaceSessions } from './open.ts'
import type { OpenSite } from './open.ts'

export { ensureWorkspace, openErpSite, watchWorkspaceSessions } from './open.ts'
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
  continueHint: '恢复该站点的对话，并在右侧浏览器打开站点入口。登录由你自己完成。',
  explore: '一键探索',
  newChat: '新对话',
  newChatHint: '新对话仍在这个 ERP 里。右侧浏览器会打开站点入口。同一文件夹里的对话共用这次登录；重启应用后可能要再登录一次。',
  explorePaused: '还看不到已登录界面，探索已暂停。登录后在对话里继续这一轮。未完成的范围不会标成完成。',
  explorePartial: '探索已开始，这一轮还没有走完。已有结果可以读，未完成的范围保持未完成。',
  exploreRound: '这一轮已经走完。覆盖率只算这一轮。',
  exploreHint: '先在右侧浏览器登录，再发送 /探索。还没登录时，探索会停下来等你。',
  exploreCommand: '探索',
  exploreCommandHint: '读取菜单和结构，深度停在 3。还没登录会暂停。',
  updateCommand: '更新探索',
  updateCommandHint: '再走一轮，覆盖这个站点上一次探索。',
  share: '分享',
  exportPack: '导出分享包',
  importPack: '导入分享包',
  chooseZip: '选择 .zip 文件',
  importDrop: '把 .zip 拖到这里，导入当前站点。',
  importing: '正在导入…',
  addSite: '添加站点',
  imported: '已导入分享包，记录待复核。导入不授予登录或写入权限。',
  packInvalid: '这份分享包无法读取。请换一份 schemaVersion 1 的 zip，或检查文件是否完整。',
  packLine: '第 {line} 行已跳过 {kind}（{reason}）。',
  packSkipped: '有些记录已跳过，待复核。',
  warnUnknownKind: '不认识的类型',
  warnInvalid: '记录不完整',
  warnDuplicate: '重复编号',
  warnDangling: '引用了未导入的记录',
  remove: '移除',
  empty: '还没有站点。粘贴网址，打开后在右侧浏览器登录。',
  firstHint: '粘贴 http 或 https 网址。深链会整理成站点入口。网址里的账号和密码不会保存。',
  editHint: '改显示名不会换成另一个站点。换成另一个 ERP 会另起一份索引，已经绑定的对话不会被挪过去。',
  saved: '添加站点时会建立它的工作区文件夹。移除只是从列表拿掉，索引还留在这台机器上。',
  working: '正在打开…',
  channel: '还连不上桌面里的 ERP 助手。重启 dsh 后再试。',
  browser: '官方右侧浏览器还不可用。',
  password: '不能提交密码。请在右侧浏览器里自己登录。',
  urlInvalid: '网址需要是 http 或 https。',
  baseRequired: '这个网址不能整理成站点入口。',
  unknownSite: '列表里没有这个站点。',
  session: '这段对话还不能绑到这个站点。',
  failed: '操作没有完成。请再试一次。',
}
const en: Record<string, string> = {
  entry: PRODUCT_ENTRY.en,
  title: PRODUCT_ENTRY.en,
  lede: 'Sign in yourself in the browser on the right. This page stores only the bookmark, not a password.',
  firstRun: 'No sites yet. Paste the ERP URL. The display name can stay empty. Sign in on the right.',
  returning: 'Continue the site you opened last, or open another from the list. Each site keeps its own workspace folder and local index.',
  name: 'Display name',
  nameHint: 'Optional. Defaults to the hostname',
  url: 'URL',
  add: 'Add',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  open: 'Open',
  continue: 'Continue',
  continueHint: 'Restore this site\'s conversation and open its site entry on the right. Sign in yourself.',
  explore: 'Start exploring',
  newChat: 'New chat',
  newChatHint: 'New chat stays on this ERP. The browser on the right opens the site entry. Chats in this folder share that sign-in. Restarting the app may ask you to sign in again.',
  explorePaused: 'The logged-in page is not visible yet, so exploration is paused. Continue this round in the conversation after you sign in. Unfinished scope is not marked complete.',
  explorePartial: 'Exploration has started, and this round is not finished. Results so far stay readable. Unfinished scope stays unfinished.',
  exploreRound: 'This round is finished. Coverage counts this round only.',
  exploreHint: 'Sign in on the right first, then send /探索. If you are not signed in yet, exploration waits.',
  exploreCommand: 'Explore',
  exploreCommandHint: 'Read the menu and structure, stopping at depth 3. It pauses until you are signed in.',
  updateCommand: 'Update explore',
  updateCommandHint: 'Run another round. This round covers the previous explore for this site.',
  share: 'Share',
  exportPack: 'Export share pack',
  importPack: 'Import share pack',
  chooseZip: 'Choose .zip',
  importDrop: 'Drop a .zip here to import it into the current site.',
  importing: 'Importing…',
  addSite: 'Add a site',
  imported: 'Share pack imported. Records need review. Import grants no login or write permission.',
  packInvalid: 'This share pack cannot be read. Use a schemaVersion 1 zip, or check that the file is intact.',
  packLine: 'Line {line}: skipped {kind} ({reason}).',
  packSkipped: 'Some records were skipped and still need review.',
  warnUnknownKind: 'unknown kind',
  warnInvalid: 'incomplete record',
  warnDuplicate: 'duplicate id',
  warnDangling: 'missing reference',
  remove: 'Remove',
  empty: 'No sites yet. Paste a URL, then sign in on the right.',
  firstHint: 'Paste an http or https URL. A deep link becomes the site entry. A username or password in the URL is not saved.',
  editHint: 'Changing the display name keeps this site. A different ERP starts another index. Conversations already bound are not moved.',
  saved: 'Adding a site creates its workspace folder. Remove only takes it off this list. The index stays on this machine.',
  working: 'Opening…',
  channel: 'Adapt ERP is not connected in the desktop yet. Restart dsh and try again.',
  browser: 'The official browser on the right is not available yet.',
  password: 'A password cannot be submitted. Sign in yourself in the browser on the right.',
  urlInvalid: 'The URL must be http or https.',
  baseRequired: 'This URL cannot be saved as a site entry.',
  unknownSite: 'That site is not in this list.',
  session: 'This conversation cannot be bound to this site.',
  failed: 'That action did not finish. Try again.',
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
.erp-assistant h2{margin:0 0 10px;font-size:15px;font-weight:600}
.erp-assistant .lede,.erp-assistant>.note{margin:0 0 16px;max-width:42rem;color:var(--dsw-alias-label-secondary,inherit)}
.erp-assistant label{display:grid;gap:4px;font-size:12px}
.erp-assistant input,.erp-assistant button{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-separator,rgba(127,127,127,.45));border-radius:8px;padding:8px 10px}
.erp-assistant button{cursor:pointer}
.erp-assistant button:disabled{cursor:default;opacity:.55}
.erp-assistant button.primary{background:var(--dsw-alias-label-primary,#1c1c1c);color:Canvas;border-color:transparent;font-weight:600;white-space:nowrap}
.erp-assistant button.primary:hover:not(:disabled){opacity:.88}
.erp-assistant button.link{border:none;background:transparent;padding:2px 0;border-radius:0;color:var(--dsw-alias-label-secondary,inherit)}
.erp-assistant button.link:hover:not(:disabled){color:var(--dsw-alias-label-primary,inherit);text-decoration:underline}
.erp-assistant button.link.danger,.erp-assistant button.link.danger:hover:not(:disabled){color:var(--dsw-alias-danger,inherit)}
.erp-assistant button:focus-visible{outline:2px solid var(--dsw-alias-label-primary,currentColor);outline-offset:2px}
.erp-assistant .card,.erp-assistant .continue{border:1px solid var(--dsw-alias-separator,rgba(127,127,127,.45));border-radius:10px;padding:14px;background:transparent;min-width:0}
.erp-assistant .continue{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 12px}
.erp-assistant .workspace{margin:0 0 16px}
.erp-assistant .card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.erp-assistant .identity{display:flex;gap:10px;align-items:flex-start;min-width:0}
.erp-assistant .continue .identity{flex:1}
.erp-assistant .identity .text{min-width:0}
.erp-assistant .identity strong,.erp-assistant .meta{overflow-wrap:anywhere}
.erp-assistant .mark{width:18px;height:18px;flex:none;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}
.erp-assistant .mark img{width:18px;height:18px;object-fit:contain;border-radius:4px;display:block}
.erp-assistant .meta,.erp-assistant .hint{display:block;color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:1.45}
.erp-assistant .hint{margin:8px 0 0}
.erp-assistant .links{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:10px}
.erp-assistant .drop{position:relative;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:14px;padding:12px;border:1px dashed var(--dsw-alias-separator,rgba(127,127,127,.45));border-radius:8px}
.erp-assistant .continue .primary,.erp-assistant .card-head .primary,.erp-assistant .drop .primary{flex:none}
.erp-assistant .drop.over{border-color:var(--dsw-alias-label-primary,inherit)}
.erp-assistant .drop-copy{display:grid;gap:4px;min-width:0}
.erp-assistant input.file-input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;opacity:0;pointer-events:none}
.erp-assistant .sites{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.erp-assistant .sites>li{display:block}
.erp-assistant .add-card{border-style:dashed}
.erp-assistant .add-card.open{grid-column:1/-1}
.erp-assistant .add-hit{display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;min-height:96px;border:none;background:transparent;padding:0;text-align:left;border-radius:0}
.erp-assistant .add-hit strong{font-size:15px}
.erp-assistant .add-card form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end;margin:0 0 8px}
.erp-assistant .form-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.erp-assistant>.error{margin:0 0 12px}
.erp-assistant .error{color:var(--dsw-alias-danger,inherit)}
.erp-explore-hint{margin:8px 0 0;max-width:28rem;color:var(--dsw-alias-label-secondary,inherit);font-size:13px;line-height:1.45}
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
  if (code === 'INVALID_ENTRY_URL' || code === 'INVALID_SITE_URL' || code === 'ERP_URL_REQUIRED' || code === 'url' || code === 'query' || code === 'empty') return t('urlInvalid')
  if (code === 'ERP_BASE_URL_REQUIRED' || code === 'ERP_BASE_URL_MUST_END_IN_SLASH' || code === 'ERP_ENTRY_OUTSIDE_BASE_URL' || code === 'slash') return t('baseRequired')
  if (code === 'ERP_UNKNOWN_SITE' || code === 'ERP_SITE_REJECTED') return t('unknownSite')
  if (code === 'ERP_SESSION_ID' || code === 'ERP_SESSION_BOUND') return t('session')
  return t('failed')
}

const PACK_WARN = /^line (\d+): skipped (\S+) \((unknown-kind|invalid-record|duplicate-id|dangling-reference)\)$/

function packWarnings(t: (key: string) => string, warnings: string[]): string {
  const lines: string[] = []
  let skipped = false
  for (const raw of warnings) {
    const match = PACK_WARN.exec(raw)
    if (!match) { skipped = true; continue }
    const reason = match[3] === 'unknown-kind' ? t('warnUnknownKind')
      : match[3] === 'invalid-record' ? t('warnInvalid')
        : match[3] === 'duplicate-id' ? t('warnDuplicate')
          : t('warnDangling')
    lines.push(t('packLine').replaceAll('{line}', match[1] ?? '').replaceAll('{kind}', match[2] ?? '').replaceAll('{reason}', reason))
  }
  if (skipped) lines.push(t('packSkipped'))
  return lines.join(' ')
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

function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
}

function zipFrom(list: ArrayLike<File> | undefined): File | undefined {
  if (!list) return undefined
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index]
    if (file && isZip(file)) return file
  }
  return undefined
}

interface FileDrop {
  preventDefault(): void
  dataTransfer?: { files?: ArrayLike<File>; dropEffect?: string }
}

let hintedSession = ''

function markExploreHint(sessionId: string): void {
  hintedSession = sessionId
}

function hostCommands(ctx: ClientCtx): { execute(sessionId: string, line: string, attachments: readonly never[]): Promise<unknown> } | undefined {
  const remote = (ctx.get('remote') ?? (ctx as { remote?: unknown }).remote) as {
    commands?: { execute(sessionId: string, line: string, attachments: readonly never[]): Promise<unknown> }
  } | undefined
  return remote?.commands
}

function executeHost(ctx: ClientCtx, sessionId: string, line: '/explore' | '/explore-update'): void {
  void hostCommands(ctx)?.execute(sessionId, line, [])
}

function submitLine(ctx: ClientCtx, sessionId: string, line: string): void {
  const hostLine = line === '/更新探索' || line === '/explore-update' ? '/explore-update' : '/explore'
  if (ctx.get('commandUi')) {
    const sessions = ctx.get('sessions') as { binding?(id: string): { ctx?: unknown } | undefined } | undefined
    const conversation = ctx.get('conversation') as { input?: { for?(actx: unknown): { setDraft(text: string): void; submit(): void } } } | undefined
    const binding = sessions?.binding?.(sessionId)
    try {
      const input = binding?.ctx ? conversation?.input?.for?.(binding.ctx) : undefined
      if (input) { input.setDraft(line); input.submit(); return }
    } catch { /* The composer is not mounted yet; the host command still runs. */ }
  }
  executeHost(ctx, sessionId, hostLine)
}

function ExploreHint({ ctx, t }: { ctx: ClientCtx; t: (key: string) => string }) {
  const sidebar = ctx.get('sidebarRight') as { mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } } | undefined
  const [sessionId, setSessionId] = useState(() => String(sidebar?.mounted?.getSnapshot() ?? ''))
  useEffect(() => {
    const mounted = sidebar?.mounted
    if (!mounted) return
    const read = () => { setSessionId(String(mounted.getSnapshot() ?? '')) }
    read()
    return mounted.subscribe(read)
  }, [sidebar])
  if (!sessionId || sessionId !== hintedSession) return null
  return <p className="erp-explore-hint">{t('exploreHint')}</p>
}

interface SlashUi {
  register(contribution: {
    name: string
    label?: () => string
    description?: () => string
    available(session: { sessionId?: string }): boolean
    ui: { kind: 'action'; run(session: { sessionId?: string }): void }
  }): () => void
}

function registerSlash(ctx: ClientCtx, t: (key: string) => string): void {
  const commandUi = ctx.get('commandUi') as SlashUi | undefined
  if (!commandUi) return
  const action = (hostLine: '/explore' | '/explore-update') => (session: { sessionId?: string }) => {
    if (session.sessionId) executeHost(ctx, session.sessionId, hostLine)
  }
  ctx.effect(() => {
    const stop = [
      commandUi.register({
        name: '探索', label: () => t('exploreCommand'), description: () => t('exploreCommandHint'), available: () => true,
        ui: { kind: 'action', run: action('/explore') },
      }),
      commandUi.register({
        name: '更新探索', label: () => t('updateCommand'), description: () => t('updateCommandHint'), available: () => true,
        ui: { kind: 'action', run: action('/explore-update') },
      }),
    ]
    return () => { for (const dispose of stop) dispose() }
  })
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
  const [adding, setAdding] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [importFile, setImportFile] = useState('')
  const [importNote, setImportNote] = useState('')
  const [importBad, setImportBad] = useState(false)
  const [ready, setReady] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const dragDepth = useRef(0)
  const addRef = useRef<HTMLLIElement | null>(null)
  function applyGuide(value: GuideValue) {
    setSites(value.sites)
    setLastOpenedId(value.lastOpenedId ?? '')
    if (value.explore) setStatus(exploreNote(t, value.explore))
    if (value.imported) {
      const warnings = packWarnings(t, value.imported.warnings)
      setImportNote(warnings ? `${t('imported')} ${warnings}` : t('imported'))
      setImportBad(false)
    }
    if (value.pack) downloadPack(value.pack.fileName, value.pack.bytes)
  }
  function clearForm() {
    setEditing('')
    setName('')
    setUrl('')
    setAdding(false)
  }
  function workspaces() {
    return ctx.get('workspaces') as {
      create(input: { path: string }): Promise<unknown>
      rename?(workspaceId: string, title: string): Promise<unknown>
      list?: { getSnapshot(): { items?: readonly unknown[] } }
    } | undefined
  }
  useEffect(() => {
    let alive = true
    guideOf(ctx, { op: 'list' }).then(value => { if (alive) { applyGuide(value); setReady(true) } }, cause => { if (alive) { setError(message(t, cause)); setReady(true) } })
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
      const edited = editing
      clearForm()
      if (!edited) {
        const created = value.sites.find(site => site.entryUrl === bookmark.entryUrl)
        if (created) await open(created, false, { prefill: '/探索' })
      } else {
        const saved = value.sites.find(site => site.id === edited)
        if (saved) await ensureWorkspace(workspaces(), saved.workspaceDir, saved.name)
      }
    } catch (cause) { setError(message(t, cause)) }
    finally { setBusy(false) }
  }
  async function open(site: ListedSite, fresh = false, follow?: { prefill?: string; submit?: string }) {
    setBusy(true)
    setError('')
    try {
      const layout = ctx.get('layout') as { selectPanel(id: string | null): void; panels?: { setRightbar?(px: number): void } } | undefined
      const sessions = ctx.get('sessions') as { create(input: { cwd?: string; workspaceId?: string }): Promise<string>; binding?(id: string): unknown } | undefined
      const uiWorkspace = ctx.get('uiWorkspace') as { openSession(id: string): void; openWorkspace?(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void> } | undefined
      const sidebar = ctx.get('sidebarRight') as { openTab(kind: 'browser', options: { params: { url: string } }): void; mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } } | undefined
      const conversation = ctx.get('conversation') as { input?: { requestDraftInitialization?(binding: unknown, options: { prompt?: string; whenDraftExists?: 'keep' }): unknown } } | undefined
      const hostWorkspaces = workspaces()
      if (!layout || !sessions || !uiWorkspace || !sidebar) throw new Error('ERP_BROWSER_UNAVAILABLE')
      await openErpSite({
        layout, sessions, uiWorkspace, sidebar, ...(conversation ? { conversation } : {}), ...(hostWorkspaces ? { workspaces: hostWorkspaces } : {}),
        bind: async (siteId, sessionId) => { await guideOf(ctx, { op: 'bind', siteId, sessionId }) },
        hint: markExploreHint,
        submitLine: (sessionId, line) => { submitLine(ctx, sessionId, line) },
      }, site, { ...(fresh ? { fresh: true } : {}), ...(follow?.prefill ? { prefill: follow.prefill } : {}), ...(follow?.submit ? { submit: follow.submit } : {}) })
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
    setAdding(false)
    queueMicrotask(() => addRef.current?.scrollIntoView({ block: 'nearest' }))
  }
  async function explore(site: ListedSite) {
    await open(site, false, { submit: '/探索' })
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
    setImportFile(file.name)
    setImportNote('')
    setImportBad(false)
    try {
      const bytes = await encodeFile(file)
      applyGuide(await guideOf(ctx, { op: 'import-pack', id: site.id, bytes }))
    } catch (cause) {
      setImportNote(message(t, cause))
      setImportBad(true)
    } finally { setBusy(false) }
  }
  function rejectPack() {
    setImportFile('')
    setImportNote(t('packInvalid'))
    setImportBad(true)
  }
  const firstRun = sites.length === 0
  const current = resumeTarget(sites, lastOpenedId)
  const formOpen = (ready && firstRun) || adding || editing !== ''
  function enterDrag(event: FileDrop) {
    event.preventDefault()
    if (busy) return
    dragDepth.current += 1
    setDragOver(true)
  }
  function leaveDrag(event: FileDrop) {
    event.preventDefault()
    if (busy) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }
  function allowDrag(event: FileDrop) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }
  function acceptDrop(event: FileDrop) {
    event.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    if (busy || !current?.sessionId) return
    const file = zipFrom(event.dataTransfer?.files)
    if (!file) { rejectPack(); return }
    void importPack(current, file)
  }
  function pickPack(file: File | undefined) {
    if (!file || !current?.sessionId) return
    if (!isZip(file)) { rejectPack(); return }
    void importPack(current, file)
  }
  return <section className="erp-assistant" data-dsh-plugin="@guosheng_047/dsh-erp" data-erp-assistant={firstRun ? 'first-run' : 'returning'}>
    <h1>{t('title')}</h1>
    <p className="lede">{firstRun ? t('firstRun') : t('returning')}</p>
    {current && !firstRun ? <div className="card continue">
      <span className="identity">
        <SiteFavicon entryUrl={current.entryUrl} fallback={<ErpIcon size={18} />} />
        <span className="text"><strong>{current.name}</strong><span className="meta">{current.entryUrl}</span><span className="meta">{t('continueHint')}</span></span>
      </span>
      <button type="button" className="primary" disabled={busy} onClick={() => { void open(current) }}>{busy ? t('working') : t('continue')}</button>
    </div> : null}
    {current?.sessionId ? <article className="card workspace">
      <div className="card-head">
        <span className="identity">
          <SiteFavicon entryUrl={current.entryUrl} fallback={<ErpIcon size={18} />} />
          <span className="text"><strong>{current.name}</strong><span className="meta">{current.entryUrl}</span></span>
        </span>
      </div>
      <p className="hint">{t('newChatHint')}</p>
      <div className="links">
        <button type="button" className="link" title={t('newChatHint')} disabled={busy} onClick={() => { void open(current, true) }}>{t('newChat')}</button>
        <button type="button" className="link" disabled={busy} onClick={() => { void explore(current) }}>{t('explore')}</button>
        <button type="button" className="link" disabled={busy} onClick={() => { void share(current) }}>{t('exportPack')}</button>
      </div>
      <div className={dragOver ? 'drop over' : 'drop'} onDragEnter={enterDrag} onDragOver={allowDrag} onDragLeave={leaveDrag} onDrop={acceptDrop}>
        <div className="drop-copy">
          <strong>{t('importPack')}</strong>
          <span className="meta">{t('importDrop')}</span>
          {importFile ? <span className="meta">{busy ? `${t('importing')} ${importFile}` : importFile}</span> : null}
          {importNote ? <span className={importBad ? 'error' : 'meta'}>{importNote}</span> : null}
        </div>
        <button type="button" className="primary" disabled={busy} onClick={() => { fileRef.current?.click() }}>{t('chooseZip')}</button>
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept=".zip,application/zip"
          tabIndex={-1}
          aria-hidden="true"
          disabled={busy}
          onChange={event => {
            const input = event.currentTarget
            const file = input.files?.[0]
            input.value = ''
            pickPack(file)
          }}
        />
      </div>
    </article> : null}
    {error ? <p className="error">{error}</p> : null}
    {status ? <p className="note">{status}</p> : null}
    <ul className="sites">
      {sites.map(site => <li className="card" key={site.id}>
        <div className="card-head">
          <span className="identity">
            <SiteFavicon entryUrl={site.entryUrl} fallback={<ErpIcon size={18} />} />
            <span className="text"><strong>{site.name}</strong><span className="meta">{site.entryUrl}</span></span>
          </span>
          <button type="button" className="primary" disabled={busy} onClick={() => { void open(site) }}>{busy ? t('working') : t('open')}</button>
        </div>
        <div className="links">
          <button type="button" className="link" disabled={busy} onClick={() => { void share(site) }}>{t('share')}</button>
          <button type="button" className="link" onClick={() => { edit(site) }}>{t('edit')}</button>
          <button type="button" className="link danger" onClick={() => { void remove(site.id) }}>{t('remove')}</button>
        </div>
      </li>)}
      <li className={formOpen ? 'card add-card open' : 'card add-card'} ref={addRef}>
        {formOpen ? <>
          <h2>{editing ? t('edit') : t('addSite')}</h2>
          <form onSubmit={event => { void submit(event) }} autoComplete="off">
            <label>{t('url')}<input value={url} onChange={event => setUrl(event.target.value)} type="url" inputMode="url" required autoComplete="off" /></label>
            <label>{t('name')}<input value={name} onChange={event => setName(event.target.value)} autoComplete="off" placeholder={t('nameHint')} /></label>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={busy || !url.trim()}>{editing ? t('save') : t('add')}</button>
              {editing || (adding && !firstRun) ? <button type="button" onClick={clearForm}>{t('cancel')}</button> : null}
            </div>
          </form>
          <p className="meta">{editing ? t('editHint') : t('saved')}</p>
          {firstRun && !editing ? <p className="meta">{t('firstHint')}</p> : null}
        </> : <button type="button" className="add-hit" onClick={() => { setAdding(true) }}>
          <strong>{t('addSite')}</strong>
          <span className="meta">{t('saved')}</span>
        </button>}
      </li>
    </ul>
  </section>
}

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  ctx.effect(installStyle)
  ctx.effect(() => {
    const sessions = ctx.get('sessions') as { list?: { getSnapshot(): { phase: string; ids: readonly string[]; byId: Readonly<Record<string, { cwd?: string; origin?: string }>> }; subscribe(listener: () => void): () => void } } | undefined
    const sidebar = ctx.get('sidebarRight') as { openTab(kind: 'browser', options: { params: { url: string } }): void; mounted?: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } } | undefined
    const layout = ctx.get('layout') as { selectPanel(id: string | null): void; panels?: { setRightbar?(px: number): void } } | undefined
    if (!sessions?.list || !sidebar?.openTab || !layout) return
    return watchWorkspaceSessions({
      sessions, sidebar, layout,
      sites: async () => {
        try { return (await guideOf(ctx, { op: 'list' })).sites }
        catch { return undefined }
      },
    })
  })
  const t = ctx.locale.bind(NS)
  const host = ctx as ClientCtx & { inject?(names: string[], plugin: (scope: ClientCtx) => void): void }
  if (host.inject) host.inject(['commandUi'], scope => { registerSlash(scope, t) })
  else registerSlash(ctx, t)
  ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
    name: 'conversation.hero.options', id: 'erp-explore-hint', order: 20, locale: NS,
  }, function ErpExploreHint(props: { t?: (key: string) => string }) {
    return <ExploreHint ctx={ctx} t={props.t ?? t} />
  }))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PRODUCT_PANEL, order: 8, locale: NS, label: () => t('entry'),
  }, ErpIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PRODUCT_PANEL, locale: NS,
  }, function ErpGuide(props: { t?: (key: string) => string }) {
    return <Guide ctx={ctx} t={props.t ?? t} />
  }))
}
