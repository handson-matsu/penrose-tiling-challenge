import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../access-counter.js',import.meta.url),'utf8');
// Literal fixture copied from the shared deployment URL and existing counter,
// not from the implementation under test. No test uses real fetch/network.
const endpoint='https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec';
const run=fetch=>{const context=vm.createContext({window:{},fetch});vm.runInContext(source,context);return context;};
test('counter sends the exact shared GET URL and only the requested app parameter',()=>{
 const calls=[];run((...args)=>{calls.push(args);return Promise.resolve({});});assert.equal(calls.length,1);
 const [url,options]=calls[0],parsed=new URL(url);
 assert.equal(parsed.origin+parsed.pathname,endpoint);
 assert.deepEqual([...parsed.searchParams],[['app','penrose-tiling-challenge']]);
 assert.deepEqual(JSON.parse(JSON.stringify(options)),{method:'GET',mode:'no-cors',cache:'no-store',credentials:'omit',keepalive:true});
});
test('one request per page even if the script executes again; new page records once',()=>{
 let calls=0;const fetch=()=>{calls++;return Promise.resolve({});},context=run(fetch);
 vm.runInContext(source,context);vm.runInContext(source,context);assert.equal(calls,1);
 run(fetch);assert.equal(calls,2);
});
test('never waits for an unresolved response and never reads response data',async()=>{
 let calls=0;const context=run(()=>{calls++;return new Promise(()=>{});});
 vm.runInContext('window.appCanRun = true',context);assert.equal(context.window.appCanRun,true);assert.equal(calls,1);
 const reads=[];run(()=>Promise.resolve({get text(){reads.push('text');},get json(){reads.push('json');}}));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(reads,[]);
});
test('rejection is handled silently without retry and app code still runs',async()=>{
 let calls=0;const context=run(()=>{calls++;return Promise.reject(Error('offline'));});
 await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext('window.appCanRun = true',context);vm.runInContext(source,context);
 assert.equal(context.window.appCanRun,true);assert.equal(calls,1);
});
test('synchronous failure or missing fetch is ignored without retry',()=>{
 let calls=0;const context=run(()=>{calls++;throw Error('blocked');});vm.runInContext(source,context);assert.equal(calls,1);
 const missing=run(undefined);assert.equal(missing.window.penroseTilingAccessRecorded,true);
});
test('only the standalone deferred script loads the counter, with no app-event wiring',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal((html.match(/src="access-counter\.js"/g)||[]).length,1);assert.match(html,/<script defer src="access-counter\.js"><\/script>/);
 for(const name of ['app.js','interaction.js','geometry.js','render.js']){
  const code=readFileSync(new URL('../'+name,import.meta.url),'utf8');assert.doesNotMatch(code,/script\.google\.com|access-counter|penroseTilingAccessRecorded|\bfetch\s*\(/);
 }
 assert.doesNotMatch(source,/addEventListener|setTimeout|setInterval|document\.|console\.|await\b/);
});
