// Synthetic ERP UI only; no production dependencies, real accounts or preloaded knowledge.
import http from 'node:http'
import { pathToFileURL } from 'node:url'
export async function site() {
  let writes = 0
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url })
    if (req.method === 'POST') { writes++; res.end('saved'); return }
    const second = req.url.startsWith('/office/'), base = second ? '/office/' : '/suite/'
    const main = req.url === base
    const nav = second ? '<aside aria-label="业务"><a href="javascript:void(0)" role="treeitem" onclick="location.href=\'/office/items\'">货品</a><a href="javascript:void(0)" role="treeitem" onclick="location.href=\'/office/stock\'">仓库</a></aside>'
      : '<nav aria-label="Workspace"><a href="/suite/products">Products</a><a href="/suite/stock">Inventory</a></nav>'
    const fields = second ? '<label>审核阶段<select><option>待核对</option><option>已确认</option></select></label><button role="tab" onclick="document.querySelector(\'dialog\').showModal()">明细窗口</button><dialog><h2>明细</h2><button onclick="this.closest(\'dialog\').close()">关闭</button></dialog>'
      : '<label>Status<select><option>Draft</option><option>Approved</option><option>Archived</option></select></label><label>Find<input name="query"></label><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Search</button><output></output>'
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html><title>${second ? 'Office ERP' : 'Suite ERP'}</title><body>${nav}<h1>${main ? 'Home' : 'Item stock'}</h1>${main ? '' : fields + '<table><tr><th>Product</th><th>Balance</th></tr><tr><td>P-501</td><td>12</td></tr></table>'}<button onclick="fetch('${base}commit',{method:'POST'})">Commit</button><div hidden>HIDDEN-CREDENTIAL</div><div data-erp-private>PRIVATE-NOTE</div><input type="hidden" value="PRIVATE-TOKEN"><input name="token" value="PRIVATE-SECRET"><script>window.fixture=true</script></body></html>`)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, writes: () => writes, close: () => new Promise(r => server.close(r)) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await site()
  process.stdout.write(fixture.origin + '\n')
  process.on('SIGTERM', () => { void fixture.close().then(() => process.exit(0)) })
}
