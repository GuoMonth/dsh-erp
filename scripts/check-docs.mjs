import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const unfenced = text => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
const links = text => [...unfenced(text).replace(/`[^`\n]*`/g, '').matchAll(/\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)].map(match => match[1])
const code = text => [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(match => match[1].trim())
const versions = text => [...new Set(text.match(/\b\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?\b/g) ?? [])].sort()
function anchors(text) {
  const counts = new Map()
  return new Set([...unfenced(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map(match => {
    const slug = match[1].replace(/<[^>]*>/g, '').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-')
    const count = counts.get(slug) ?? 0
    counts.set(slug, count + 1)
    return count ? `${slug}-${count}` : slug
  }))
}
const guides = ['system-configuration', 'native-and-sharing', 'adaptive-learning', 'knowledge', 'storage', 'development', 'npm-publishing']
const pairs = [['README.md', 'docs/README.zh-CN.md'], ['docs/index.md', 'docs/index.zh-CN.md'], ...guides.map(stem => [`docs/${stem}.en.md`, `docs/${stem}.md`])]
for (const [en, zh] of pairs) {
  const a = read(en), b = read(zh)
  assert.deepEqual(code(a), code(b), `${en}: translated commands differ`)
  assert.deepEqual(versions(a), versions(b), `${en}: translated versions differ`)
  assert.equal((a.match(/^## /gm) ?? []).length, (b.match(/^## /gm) ?? []).length, `${en}: section counts differ`)
  for (const [source, target, text] of [[en, zh, a], [zh, en, b]]) {
    const local = relative(dirname(source), target).replaceAll('\\', '/')
    const hosted = `https://github.com/GuoMonth/dsh-erp/blob/main/${target}`
    assert.ok(links(text).includes(local) || links(text).includes(hosted), `${source}: missing language link`)
  }
}
const files = ['README.md', 'CHANGELOG.md', 'NOTICE.md']
function walk(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) walk(name)
    else if (entry.name.endsWith('.md')) files.push(name)
  }
}
walk('docs')
let count = 0
for (const file of files) for (const target of links(read(file))) {
  count++
  let path, fragment
  if (target.startsWith('https://github.com/GuoMonth/dsh-erp/blob/main/')) {
    const url = new URL(target)
    path = resolve(root, decodeURIComponent(url.pathname.split('/blob/main/')[1]))
    fragment = decodeURIComponent(url.hash.slice(1))
  } else if (!/^[a-z][a-z\d+.-]*:/i.test(target)) {
    const [name, hash = ''] = target.split('#')
    path = name ? resolve(root, dirname(file), decodeURIComponent(name)) : resolve(root, file)
    fragment = decodeURIComponent(hash)
  } else continue
  assert.ok(existsSync(path), `${file}: missing link ${target}`)
  if (fragment && path.endsWith('.md')) assert.ok(anchors(readFileSync(path, 'utf8')).has(fragment), `${file}: missing heading ${target}`)
}
const pkg = JSON.parse(read('package.json'))
for (const path of pkg.files.filter(path => path.endsWith('.md'))) assert.ok(existsSync(resolve(root, path)), `Package guide missing: ${path}`)
console.log(`Documentation passed: ${pairs.length} language pairs, ${files.length} files, ${count} links.`)
