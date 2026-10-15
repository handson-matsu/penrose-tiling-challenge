import test from 'node:test';
import assert from 'node:assert/strict';
import {vertices,edge,attach,near,overlaps,intersectionPolygon,polygonArea,analyzePlacement,spatialIndex,placementOptions,topology,validate} from '../geometry.js';
import {TilingSession,PointerGesture} from '../interaction.js';
import {exportSVG} from '../render.js';
import {sun} from '../fixtures/generate.mjs';
const base={type:'thick',x:0,y:0,angle:0};
test('two selections auto-place in either order, then clear both selections',()=>{
 for(const reverse of [false,true]){const s=new TilingSession([base]);
  assert.equal((reverse?s.choosePalette('thin',0):s.chooseBoard({tile:0,i:0})).state,'waiting');
  assert.equal((reverse?s.chooseBoard({tile:0,i:0}):s.choosePalette('thin',0)).state,'placed');
  assert.equal(s.tiles.length,2);assert.equal(s.selected,null);assert.equal(s.palette,null);assert.equal(s.failure,null);
 }
 const first=new TilingSession();assert.equal(first.choosePalette('thick',2).state,'placed');assert.equal(first.tiles.length,1);
});
test('failure keeps geometry/history intact and identifies the actual mismatched edge',()=>{
 const s=new TilingSession([base]);s.chooseBoard({tile:0,i:0});const result=s.choosePalette('thick',0);
 assert.equal(result.state,'failed');assert.equal(s.tiles.length,1);assert.equal(s.history.past.length,0);
 assert.equal(result.check.code,'matching');assert.deepEqual(result.check.mismatches,[{tile:0,candidateEdge:0,existingEdge:0}]);
 assert.ok(s.failure);assert.equal(s.choosePalette('thin',0).state,'placed');assert.equal(s.failure,null);
});
test('delete first/arbitrary tile with undo/redo leaves all other coordinates untouched',()=>{
 const patch=sun(3),s=new TilingSession(patch),snapshot=JSON.stringify(patch);
 assert.equal(s.remove(0),true);assert.deepEqual(s.tiles,patch.slice(1));s.undo();assert.equal(JSON.stringify(s.tiles),snapshot);s.redo();assert.deepEqual(s.tiles,patch.slice(1));
 const previous=s.tiles;assert.equal(s.remove(17),true);assert.deepEqual(s.tiles,previous.filter((_,i)=>i!==17));assert.equal(s.remove(999),false);
});
test('delete an interior tile and reinsert through the newly exposed hole boundary',()=>{
 const patch=sun(4),top=topology(patch),boundary=new Set(top.exposed.map(e=>e.tile)),k=patch.findIndex((_,i)=>!boundary.has(i)),original=patch[k];
 const s=new TilingSession(patch);s.remove(k);const exposed=topology(s.tiles).exposed;
 let solution;
 for(const e of exposed)for(let i=0;i<4;i++){
  const t=attach(s.tiles[e.tile],e.i,original.type,i);
  if(near([t.x,t.y],[original.x,original.y])&&validate(t,s.tiles,true).ok)solution={e,i};
 }
 assert.ok(solution);s.choosePalette(original.type,solution.i);assert.equal(s.chooseBoard(solution.e).state,'placed');
 assert.equal(s.tiles.length,patch.length);assert.equal(topology(s.tiles).violations.length,0);
});
test('deletion may split components without moving or rejecting any remaining tile',()=>{
 const s=new TilingSession([base,attach(base,0,'thin',0),attach(base,2,'thin',2)]);const survivors=[s.tiles[1],s.tiles[2]];
 s.remove(0);assert.deepEqual(s.tiles,survivors);s.undo();assert.equal(s.tiles.length,3);s.redo();assert.deepEqual(s.tiles,survivors);
});
test('convex intersection uses rhomb geometry and distinguishes edge/vertex touches',()=>{
 assert.ok(Math.abs(polygonArea(intersectionPolygon(vertices(base),vertices(base)))-Math.sin(72*Math.PI/180))<1e-12);
 const separated={...base,x:1.3,y:.9}; // bounding boxes meet, polygons do not
 assert.ok(Math.abs(separated.x)<1.618&&Math.abs(separated.y)<1.176);assert.equal(overlaps(base,separated),false);assert.deepEqual(intersectionPolygon(vertices(base),vertices(separated)),[]);
 assert.deepEqual(intersectionPolygon(vertices(base),vertices(attach(base,0,'thin',0))),[]);
 const v=vertices(base),touch={...base,x:v[2][0]-v[0][0]};assert.equal(overlaps(base,touch),false);assert.deepEqual(intersectionPolygon(vertices(base),vertices(touch)),[]);
});
test('all actual overlapping tiles and their clipped regions are reported',()=>{
 const tiles=[{...base,x:-.55},{...base,x:.55}],result=analyzePlacement(base,tiles,true);
 assert.equal(result.code,'overlap');assert.equal(result.overlapping.length,2);assert.deepEqual(result.overlapping.map(e=>e.tile),[0,1]);
 for(const e of result.overlapping){assert.ok(polygonArea(e.polygon)>0);assert.ok(polygonArea(e.polygon)<Math.sin(72*Math.PI/180));}
});
test('indexed and full validation agree for 430 tiles in both modes, including holes',t=>{
 const patch=sun(5).filter((_,i)=>i!==123),top=topology(patch),index=spatialIndex(patch),start=performance.now();
 for(const strict of [false,true])for(const e of top.exposed){
  const options=placementOptions(patch,e,strict,index);assert.equal(options.length,8);
  for(const o of options){const c=attach(patch[e.tile],e.i,o.type,o.i);assert.equal(o.ok,validate(c,patch,strict).ok);assert.equal(o.ok,analyzePlacement(c,patch,strict,index).ok);}
 }
 t.diagnostic(`429 tiles, all boundary options in both modes + reference comparison: ${(performance.now()-start).toFixed(1)}ms`);
});
test('mode change preserves tiles; existing violations and local availability follow current mode',()=>{
 const s=new TilingSession([base]);s.strict=false;s.chooseBoard({tile:0,i:0});assert.equal(s.choosePalette('thick',0).state,'placed');const snapshot=JSON.stringify(s.tiles);
 s.strict=true;assert.equal(JSON.stringify(s.tiles),snapshot);assert.equal(topology(s.tiles).violations.length,1);
 const strict=placementOptions([base],{tile:0,i:0},true),free=placementOptions([base],{tile:0,i:0},false);
 assert.equal(strict.filter(o=>o.ok).length,2);assert.equal(free.filter(o=>o.ok).length,8);
 const blocked=[base,attach(base,0,'thick',0),attach(base,1,'thick',0)];
 assert.equal(placementOptions(blocked,{tile:1,i:3},true).some(o=>o.ok),false);
 assert.equal(placementOptions(blocked,{tile:1,i:3},false).some(o=>o.ok),true);
});
test('click/drag threshold, outward-and-back, pointer cancellation and pinch',()=>{
 const p=new PointerGesture(6);p.down(1,[100,100]);p.move(1,[106,100]);assert.equal(p.up(1),true);
 p.down(1,[0,0]);p.move(1,[7,0]);p.move(1,[0,0]);assert.equal(p.up(1),false);
 p.down(1,[0,0]);assert.equal(p.up(1,true),false);
 p.down(1,[0,0]);p.down(2,[100,0]);p.move(2,[120,0]);assert.equal(p.up(2),false);assert.equal(p.up(1),false);
 p.down(3,[0,0]);assert.equal(p.up(3),true);
});
test('PNG source excludes operation overlays and violations, but preserves guides/arcs/modes',()=>{
 const pair=[base,attach(base,0,'thick',0)],top=topology(pair);
 for(const bumps of [false,true]){
  const {svg}=exportSVG(pair,{bumps,showArcs:true,showGuides:true,color:true,last:true,background:'transparent'},top.violations);
  assert.equal(svg.includes('#d43640'),false);assert.equal(svg.includes('#8750ce'),false);assert.equal(svg.includes('latest-marker'),false);
  assert.equal(svg.includes('stroke-dasharray'),bumps);assert.ok(svg.includes('#247fa8'));assert.ok(svg.includes('#d35d8c'));
 }
});

test('roundoff in rotated, translated contact does not become positive-area overlap',()=>{
 const tile={...base,x:123.456,y:-87.654,angle:1.23456789};
 for(const type of ['thin','thick'])for(let i=0;i<4;i++)for(let j=0;j<4;j++){
  const c=attach(tile,i,type,j),result=analyzePlacement(c,[tile],false,spatialIndex([tile]));
  assert.equal(result.ok,true);assert.equal(result.overlapping.length,0);
 }
});
