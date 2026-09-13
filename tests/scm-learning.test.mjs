import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import http from 'node:http'
import {chromium} from 'playwright'
import {requestFor,readScm} from './fixtures/scm-alpha5/read.mjs'
import {LearningRuntime} from './fixtures/scm-alpha5/learning.mjs'
import {StorageClient} from '../dist/storage/client.js'
import {BrowserSession} from './fixtures/scm-alpha5/session.mjs'
const scope={site:'fixture',account:'reader'}
const signal=()=>new AbortController().signal
const readArgs={query:'products',sessionId:'test',revision:1}

test('SCM read contract fixes origin/method/path and distinguishes document filters from product search', async()=>{
  const base=new URL('https://example.test/')
  assert.equal(requestFor(base,{...readArgs,query:'stock',keyword:'a&action=delete'}).searchParams.get('keyword'),'a&action=delete')
  assert.equal(requestFor(base,{...readArgs,query:'stock'}).searchParams.get('positiveOnly'),'0')
  assert.equal(requestFor(base,{...readArgs,query:'sales',keyword:'SO-1'}).searchParams.get('soNo'),'SO-1')
  for(const change of [{query:'delete'},{query:'product',id:'../delete'},{query:'purchase',id:'1',keyword:'x'},{page:0},{limit:101},{query:'menu',keyword:'x'}])assert.throws(()=>requestFor(base,{...readArgs,...change}))
})

test('real browser login token stays in worker-side read; wrong grants, takeover, redirect and writes fail',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'erp-scm-'));const requests=[]
  let redirect=false
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){res.end('<html><body><h1>Read fixture</h1></body></html>');return}
    requests.push({url:req.url,method:req.method,token:req.headers.token})
    if(redirect){res.writeHead(302,{location:'/write'});res.end();return}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({code:0,data:{total:1,list:[{productCode:'P1',token:req.headers.token,debug:req.headers.token,billingEmail:'private@example.test'}]}}))
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=new URL(`http://127.0.0.1:${server.address().port}/`)
  const browser=new BrowserSession({directory:dir,headless:process.env.ERP_TEST_HEADFUL!=='1',sandbox:false,prepare:async()=>{}})
  try{
    await browser.open({siteUrl:base.href,scope},signal());const page=browser.context.pages()[0];await page.goto(base.href);await page.evaluate(()=>sessionStorage.setItem('v1@CacheToken',JSON.stringify({token:'fixture-token-private'})))
    let status=browser.status()
    await assert.rejects(browser.scmRead({...readArgs,sessionId:status.sessionId,revision:status.revision},signal()),/SCM_READ_GRANT_INVALID/)
    status=await browser.scmEnable(status.sessionId,status.revision,signal())
    const input={...readArgs,sessionId:status.sessionId,revision:status.revision}
    const result=await browser.scmRead(input,signal());assert.equal(result.data.list[0].productCode,'P1');assert.ok(!JSON.stringify(result).includes('fixture-token-private'));assert.ok(!JSON.stringify(result).includes('private@example'))
    const api=requests.find(r=>r.url.startsWith('/api/'));assert.equal(api.method,'GET');assert.equal(api.token,'fixture-token-private')
    browser.pause();await assert.rejects(browser.scmRead(input,signal()),/SCM_READ_GRANT_INVALID/)
    status=browser.status();status=await browser.scmEnable(status.sessionId,status.revision,signal());redirect=true
    await assert.rejects(browser.scmRead({...input,revision:status.revision},signal()),/SCM_READ_TRANSPORT/)
    assert.ok(!requests.some(x=>x.url==='/write'));assert.equal(browser.status().state,'manual')
  }finally{await browser.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
})

test('menu import preserves discovery, identity, provenance and idempotence; durable scheduler enforces breadth-first order',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'erp-learning-'));let storage=new StorageClient({directory:dir});let learning=new LearningRuntime(storage)
  try{
    const tree=[{id:'1',name:'Goods',url:'',children:[{id:'2',name:'',url:'/products',children:[]}]}]
    await storage.call('observe',{id:'menu-source',scope,url:'https://example.test/api/menu',title:'SCM menu',text:JSON.stringify(tree),locale:'en-US',context:JSON.stringify({source:'scm-usa-read-v1',query:'menu'}),observedAt:new Date().toISOString()},signal())
    const imported=await learning.importMenu(scope,'menu-source',signal());assert.equal(imported.nodes,2);assert.equal(imported.unnamed,1)
    const {exportKnowledge}=await import('../dist/knowledge/export.js');const exported=await exportKnowledge(storage,scope,signal());assert.equal(exported.records,3);assert.ok(readFileSync(exported.markdownPath,'utf8').includes('Goods'));const otherExport=await exportKnowledge(storage,{...scope,account:'other'},signal());assert.equal(otherExport.records,0)
    await learning.importMenu(scope,'menu-source',signal())
    const menu=await storage.call('knowledgeGet',{scope,id:imported.menuIds[1]},signal());assert.equal(menu.record.version,1);assert.equal(menu.record.stage,'discovered');assert.deepEqual(menu.record.flags,['needs-review'])
    const edges=await storage.call('knowledgeNeighbors',{scope,id:imported.menuIds[0],direction:'out',after:'',limit:10},signal());assert.equal(edges.items.length,1);assert.equal(edges.items[0].record.version,1)
    await assert.rejects(learning.importMenu({...scope,account:'other'},'menu-source',signal()),/MENU_OBSERVATION_REQUIRED/)
    const t=await learning.start(scope,'round',[{id:'deep',level:3,label:'Fields'},{id:'global',level:1,label:'Global framework'},{id:'pages',level:2,label:'Functional pages'}],signal())
    assert.equal((await learning.status(scope,'round',signal())).next.id,'global')
    await assert.rejects(learning.finish(scope,'round',t.version,'deep','observed',['menu-source'],'evidence',signal()),/OUT_OF_ORDER/)
    await assert.rejects(learning.finish(scope,'round',t.version,'global','observed',[],'missing',signal()),/EVIDENCE_REQUIRED/)
    let state=await learning.finish(scope,'round',t.version,'global','observed',['menu-source'],'Menu metadata only',signal())
    state=await learning.pause(scope,'round',state.version,false,signal());assert.equal((await learning.status(scope,'round',signal())).next,null)
    await storage.dispose();storage=new StorageClient({directory:dir});learning=new LearningRuntime(storage)
    state=await learning.pause(scope,'round',state.version,true,signal());state=await learning.finish(scope,'round',state.version,'pages','blocked',[],'Unreviewed navigation',signal());state=await learning.finish(scope,'round',state.version,'deep','observed',['menu-source'],'Fixture evidence',signal())
    const ended=await learning.status(scope,'round',signal());assert.equal(ended.state,'round-ended');assert.equal(ended.coverage.blocked,1);assert.equal(ended.coverage.observed,2)
  }finally{await storage.dispose();rmSync(dir,{recursive:true,force:true})}
})

test('product chain joins SKU IDs, preserves cancelled rows and reports bounded/empty scans without false absence',async()=>{
  const {traceProduct}=await import('./fixtures/scm-alpha5/trace.mjs');const calls=[]
  const fake=async(input)=>{const {scmReadSchema}=await import('./fixtures/scm-alpha5/contract.mjs');const {validateJsonSchemaValue,valueSchemaSpecToJsonSchema}=await import('@deepseek-ai/dsh-tools');assert.deepEqual(validateJsonSchemaValue(valueSchemaSpecToJsonSchema(scmReadSchema),input,''),[]);calls.push(input);const data={products:{total:1,list:[{id:'1',productCode:'P'}]},product:{id:'1',productCode:'P',skus:[{id:'s1'},{id:'s2'}]},stock:{total:1,list:[{productId:'1',qtyOnHand:10}]},purchases:{total:3,list:[{id:'2'}]},purchase:{id:'2',poNo:'PO',status:'CANCELLED',items:[{skuId:'s2',qty:2},{skuId:'other',qty:90}]},sales:{total:0,list:[]}}[input.query];return {query:input.query,url:'https://example.test/',observedAt:new Date().toISOString(),data,limitations:[],observationId:'obs-'+calls.length}}
  const r=await traceProduct(fake,{sessionId:'test',revision:1,productCode:'P',maxDocuments:1},'P',1,signal());assert.equal(r.found,true);assert.equal(r.documents.purchases.scanComplete,false);assert.equal(r.documents.purchases.matched[0].items.length,1);assert.equal(r.documents.purchases.matched[0].status,'CANCELLED');assert.equal(r.documents.sales.scanComplete,true)
  const empty=await traceProduct(async()=>({...await fake({...readArgs,query:'products'}),data:{total:0,list:[]}}),{sessionId:'test',revision:1},'MISSING',1,signal());assert.equal(empty.found,false);assert.equal(empty.complete,false)
  const aborted=new AbortController();aborted.abort();await assert.rejects(traceProduct(fake,{sessionId:'test',revision:1},'P',1,aborted.signal))
})

test('menu refresh retires moved edges and removed nodes without creating a hierarchy cycle',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'erp-menu-refresh-'));const storage=new StorageClient({directory:dir});const learning=new LearningRuntime(storage)
  const save=async(id,tree)=>storage.call('observe',{id,scope,url:'https://example.test/api/menu',title:'SCM menu',text:JSON.stringify(tree),locale:'en-US',context:JSON.stringify({source:'scm-usa-read-v1',query:'menu'}),observedAt:new Date().toISOString()},signal())
  try{
    await save('before',[{id:'1',name:'A',url:'',children:[{id:'2',name:'B',url:'',children:[]},{id:'3',name:'C',url:'',children:[]}]}]);const first=await learning.importMenu(scope,'before',signal())
    await save('after',[{id:'2',name:'B',url:'',children:[{id:'1',name:'A',url:'',children:[]}]}]);await learning.importMenu(scope,'after',signal())
    const removed=await storage.call('knowledgeGet',{scope,id:first.menuIds[2]},signal());assert.equal(removed.record.lifecycle,'retired')
    const outgoing=await storage.call('knowledgeNeighbors',{scope,id:first.menuIds[0],direction:'out',predicate:'contains',after:'',limit:10},signal());assert.equal(outgoing.items.length,0)
    const incoming=await storage.call('knowledgeNeighbors',{scope,id:first.menuIds[0],direction:'in',predicate:'contains',after:'',limit:10},signal());assert.equal(incoming.items.length,1)
  }finally{await storage.dispose();rmSync(dir,{recursive:true,force:true})}
})
