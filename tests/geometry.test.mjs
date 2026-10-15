import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vertices,edge,distance,attach,near,overlaps,matches,validate,topology,History,bounds,dot,sub,RULES} from '../geometry.js';
import {sun} from '../fixtures/generate.mjs';
import {exportSVG,edgePath,filename,arcs} from '../render.js';
const base={type:'thick',x:0,y:0,angle:0};
test('all edges have unit length; exact P3 angles',()=>{
 for(const type of ['thick','thin']){const v=vertices({...base,type});for(let i=0;i<4;i++){
  assert.ok(Math.abs(distance(v[i],v[(i+1)%4])-1)<1e-12);
  const a=sub(v[(i+3)%4],v[i]),b=sub(v[(i+1)%4],v[i]);
  const angle=Math.acos(dot(a,b))*180/Math.PI,acute=type==='thick'?72:36;
  assert.ok(Math.abs(angle-(i%2?180-acute:acute))<1e-10);
 }}
});
test('all 64 automatic edge connections coincide, with no interior overlap',()=>{
 for(const a of ['thick','thin'])for(const b of ['thick','thin'])for(let i=0;i<4;i++)for(let j=0;j<4;j++){
  const t={type:a,x:2.4,y:-3.2,angle:.731},c=attach(t,i,b,j),[p,q]=edge(t,i),[r,s]=edge(c,j);
  assert.ok(near(p,s)&&near(q,r));assert.equal(overlaps(t,c),false);
 }
});
test('SAT distinguishes touching, containment, crossing and separation',()=>{
 assert.ok(overlaps(base,base));assert.ok(overlaps(base,{...base,x:.5}));
 assert.ok(overlaps(base,{...base,type:'thin',angle:Math.PI/2}));
 assert.equal(overlaps(base,{...base,x:4}),false);
 assert.equal(overlaps(base,attach(base,0,'thin',0)),false);
});
test('standard P3 table: type AND opposite traversal direction required',()=>{
 // Independent expected compatibility for edge indices in the documented convention.
 const allowed={ 'thick-thick':['03','30','12','21'], 'thin-thin':['01','10','23','32'],
  'thick-thin':['00','31','12','23'], 'thin-thick':['00','13','21','32']};
 for(const a of ['thick','thin'])for(const b of ['thick','thin'])for(let i=0;i<4;i++)for(let j=0;j<4;j++)
  assert.equal(matches({type:a},i,{type:b},j),allowed[a+'-'+b].includes(''+i+j),`${a} ${b} ${i}${j}`);
});
test('free mode accepts periodic same orientation lattice; strict rejects mismatches',()=>{
 const [a,b]=edge(base,0),translation=sub(b,a),next={...base,x:translation[0],y:translation[1]};
 assert.equal(validate(next,[base],false).ok,true);assert.equal(validate(next,[base],true).ok,false);
 const pair=[base,next],snapshot=JSON.stringify(pair);assert.ok(topology(pair).violations.length);assert.equal(JSON.stringify(pair),snapshot);
});
test('all simultaneous contacts are checked, not only the selected edge',()=>{
 const patch=sun(3);for(let k=1;k<patch.length;k++){
  const others=patch.filter((_,i)=>i!==k),c=patch[k];assert.equal(validate(c,others,true).ok,true);
 }
});
test('Undo, Redo, reset undo, and branch invalidation',()=>{
 const h=new History();h.set([base]);h.set([base,attach(base,0,'thin',0)]);assert.ok(h.undo());assert.equal(h.tiles.length,1);
 assert.ok(h.redo());assert.equal(h.tiles.length,2);h.set([]);h.undo();assert.equal(h.tiles.length,2);
 h.undo();h.set([base]);assert.equal(h.redo(),false);assert.equal(h.future.length,0);
});
test('independent stored sun fixture: geometry, overlaps, arrows and generation reproducibility',()=>{
 const patch=JSON.parse(readFileSync(new URL('../fixtures/sun-4.json',import.meta.url)));
 assert.equal(patch.length,160);assert.deepEqual(patch,sun(4));const top=topology(patch);assert.equal(top.violations.length,0);assert.ok(top.shared.length>200);
 for(let i=0;i<patch.length;i++)for(let j=0;j<i;j++)assert.equal(overlaps(patch[i],patch[j]),false);
 assert.equal(patch.filter(t=>t.type==='thick').length,100);
});
test('4096px image document includes all pieces, margins, mode, arcs, color and background',()=>{
 const patch=sun(3),b=bounds(patch,.35);
 for(const background of ['white','transparent'])for(const bumps of [true,false]){
  const r=exportSVG(patch,{background,bumps,showArcs:true,color:false});
  assert.equal(Math.max(r.width,r.height),4096);assert.ok(r.svg.includes('stroke="#247fa8"'));
  assert.equal(r.svg.includes('<rect'),background==='white');assert.ok(r.svg.includes('#faf9f6'));
  for(const t of patch)for(const p of vertices(t)){assert.ok(p[0]>b.x&&p[0]<b.x+b.w&&p[1]>b.y&&p[1]<b.y+b.h);}
 }
 assert.match(filename(new Date(2026,9,15,22,5,3)),/^penrose-20261015-220503.png$/);
});
test('hundreds of pieces: 5th sun subdivision is valid',t=>{
 const start=performance.now(),patch=sun(5),top=topology(patch);assert.ok(patch.length>400);assert.equal(top.violations.length,0);
 const c=attach(patch[top.exposed[0].tile],top.exposed[0].i,'thick',0);validate(c,patch,true);
 t.diagnostic(`${patch.length} pieces; generate + topology + candidate: ${(performance.now()-start).toFixed(1)}ms`);
});
test('a partial collinear edge contact is rejected',()=>{
 const adjacent=attach(base,0,'thin',0),[a,b]=edge(base,0),v=sub(b,a);
 const shifted={...adjacent,x:adjacent.x+v[0]*.25,y:adjacent.y+v[1]*.25};
 assert.equal(overlaps(base,shifted),false);assert.equal(validate(shifted,[base],false).ok,false);
 assert.match(validate(shifted,[base],false).reason,/一部分/);
});
// Sample the actual SVG path (lines, quadratics and cubics), independent of the
// matching predicate. Every matching pair must draw the identical seam backwards.
function pathSamples(path){
 const tokens=path.match(/[MLQC]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g);let k=0,p,points=[];
 const read=()=>[Number(tokens[k++]),Number(tokens[k++])];
 while(k<tokens.length){const command=tokens[k++];if(command==='M'){p=read();points.push(p);continue;}
  const n=command==='L'?1:command==='Q'?2:3,controls=[p,...Array.from({length:n},read)];
  for(let i=1;i<=20;i++){const t=i/20;let a=controls.map(p=>[...p]);while(a.length>1)a=a.slice(0,-1).map((p,j)=>[p[0]*(1-t)+a[j+1][0]*t,p[1]*(1-t)+a[j+1][1]*t]);points.push(a[0]);}p=controls.at(-1);
 }return points;
}
test('every matching pair has exactly complementary asymmetric SVG profiles',()=>{
 for(const a of ['thick','thin'])for(const b of ['thick','thin'])for(let i=0;i<4;i++)for(let j=0;j<4;j++){
  const t={...base,type:a};if(!matches(t,i,{type:b},j))continue;
  const next=attach(t,i,b,j),first=pathSamples(edgePath(t,i)),second=pathSamples(edgePath(next,j)).reverse();
  assert.equal(first.length,second.length);for(let k=0;k<first.length;k++)assert.ok(distance(first[k],second[k])<3e-7);
 }
});

test('blue/pink circular arc endpoints coincide across every known shared edge',()=>{
 const patch=sun(4);
 const endpoints=t=>[...arcs(t).matchAll(/d="M ([^A]+) A \S+ \S+ 0 0 0 ([^"]+)"[^>]+stroke="([^"]+)"/g)].flatMap(m=>[m[1],m[2]].map(p=>({p:p.trim().split(/\s+/).map(Number),color:m[3]})));
 for(const [a,b] of topology(patch).shared){
  const point=endpoints(patch[a.tile]).find(({p})=>Math.abs(distance(a.a,p)+distance(p,a.b)-1)<1e-6);
  assert.ok(point);assert.ok(endpoints(patch[b.tile]).some(q=>q.color===point.color&&distance(q.p,point.p)<3e-7));
 }
});
