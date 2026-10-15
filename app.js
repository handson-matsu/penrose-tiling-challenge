import {edge,topology,bounds,add,sub,mul,distance,placementOptions,validate,attach} from './geometry.js';
import {TilingSession,PointerGesture} from './interaction.js';
import {tileSVG,tilePath,edgePath,createPNG,filename} from './render.js';
import {sun} from './fixtures/generate.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let restored=[];
try{const data=JSON.parse(localStorage.getItem('penrose-v1')||'[]');if(Array.isArray(data)&&data.length<=5000&&data.every(t=>['thick','thin'].includes(t.type)&&[t.x,t.y,t.angle].every(Number.isFinite)))restored=data;}catch{}
const session=new TilingSession(restored);
let topo=topology(session.tiles),camera={x:0,y:0,scale:95},frame=0;
let deleting=false,hoverTile=null,focusedViolation=null;
let available=null,availabilityGeneration=0,availabilityDone=0;
const settings={bumps:true,showArcs:false,color:true,showGuides:false,background:'white'};
const board=$('board'),world=$('world');
const svgElement=(name,attrs={})=>{const e=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function clearFeedback(){session.failure=null;focusedViolation=null;}
function persist(){try{localStorage.setItem('penrose-v1',JSON.stringify(session.tiles));}catch{status('ブラウザへの自動保存ができません。画像を保存してください。',true);}}
function changed(){topo=topology(session.tiles);focusedViolation=null;hoverTile=null;persist();updateAvailability();schedule();}
function updateAvailability(){
 const generation=++availabilityGeneration;available=null;availabilityDone=0;
 if(!$('available').checked)return;
 available=new Map();const entries=topo.exposed,tiles=session.tiles,index=session.index,strict=session.strict;
 // Work in small chunks; stale results are cancelled on edits/mode changes/OFF.
 function chunk(){
  if(generation!==availabilityGeneration||!$('available').checked)return;
  const deadline=performance.now()+7;
  while(availabilityDone<entries.length&&performance.now()<deadline){
   const e=entries[availabilityDone++],options=placementOptions(tiles,e,strict,index);
   available.set(`${e.tile}:${e.i}`,options.some(o=>o.ok));
  }
  schedule();if(availabilityDone<entries.length)requestAnimationFrame(chunk);
 }
 requestAnimationFrame(chunk);
}
function worldPoint(x,y){const r=board.getBoundingClientRect();return [(x-r.left-r.width/2)/camera.scale+camera.x,(y-r.top-r.height/2)/camera.scale+camera.y];}
function cameraTransform(){const r=board.getBoundingClientRect();world.setAttribute('transform',`translate(${r.width/2} ${r.height/2}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`);$('zoomLevel').textContent=Math.round(camera.scale/95*100)+'%';}
function line(t,i,color,width=2.5){return svgElement('path',{d:edgePath(t,i,settings.bumps),fill:'none',stroke:color,'stroke-width':width,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'});}
function outline(t,color,width=2.5,fill='none') {return svgElement('path',{d:tilePath(t,settings.bumps),fill,stroke:color,'stroke-width':width,'vector-effect':'non-scaling-stroke','pointer-events':'none','stroke-linejoin':'round'});}
function crossMark(t,i,size=5){
 const [a,b]=edge(t,i),p=mul(add(a,b),.5),d=size/camera.scale;
 return svgElement('path',{d:`M ${p[0]-d} ${p[1]-d} L ${p[0]+d} ${p[1]+d} M ${p[0]-d} ${p[1]+d} L ${p[0]+d} ${p[1]-d}`,fill:'none',stroke:'#c42d3c','stroke-width':2.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'});
}
function report(result){
 if(result.state==='placed'){changed();status('配置しました。次の2辺を選んでください。');}
 else if(result.state==='failed'){status(result.check.reason+' 赤い部分を確認し、別の辺を選んでください。',true);schedule();}
 else {status(session.selected?'下の菱形から、つなぐ辺を選んでください。':'追加する辺を選びました。配置済みの空いている辺を選んでください。');schedule();}
}
function chooseEdge(entry){if(deleting)return;clearFeedback();report(session.chooseBoard(entry));}
function choosePalette(type,i){if(deleting){status('追加するには「タイル削除」をOFFにしてください。');return;}clearFeedback();report(session.choosePalette(type,i));}
function inspectViolation(index){
 const entries=topo.violations[index];if(!entries)return;
 session.clear();focusedViolation=index;
 const [a,b]=edge(session.tiles[entries[0].tile],entries[0].i),p=mul(add(a,b),.5),r=board.getBoundingClientRect();
 camera.x=p[0];camera.y=p[1];camera.scale=Math.max(camera.scale,Math.min(145,(r.width-40)/3,(r.height-115)/2.5));
 status(`違反辺 ${index+1} / ${topo.violations.length}：${entries.map(e=>e.tile+1).join('・')}枚目の凹凸の種類または向きが不一致です。`,true);schedule();
}
function activate(action){
 if(!action)return;
 const kind=action.dataset.action;
 if(kind==='edge')chooseEdge({tile:+action.dataset.tile,i:+action.dataset.edge});
 if(kind==='violation')inspectViolation(+action.dataset.violation);
 if(kind==='delete'&&deleting){const i=+action.dataset.tile;if(session.remove(i)){changed();status(`${i+1}枚目を削除しました。Undoで戻せます。`);}}
}
function draw(){
 cameraTransform();board.classList.toggle('deleting',deleting);
 world.innerHTML=session.tiles.map((t,k)=>`<g data-tile="${k}" ${deleting?`data-action="delete" tabindex="0" role="button" aria-label="${k+1}枚目のタイルを削除"`:''}>${tileSVG(t,{...settings,last:k===session.tiles.length-1})}</g>`).join('');
 // Clamp only screen-space outlines: zooming out keeps boundaries legible.
 for(const el of world.querySelectorAll('g>path:first-child'))el.style.strokeWidth=Math.max(.018,.7/camera.scale);
 const last=session.tiles.at(-1);if(last)world.append(svgElement('circle',{cx:last.x,cy:last.y,r:.043,class:'latest-marker','pointer-events':'none'}));
 if(available)for(const e of topo.exposed){const ok=available.get(`${e.tile}:${e.i}`);if(ok!==undefined)world.append(line(session.tiles[e.tile],e.i,ok?'#31865b':'#c94d57',2.6));}
 if(session.strict){
  for(let k=0;k<topo.violations.length;k++){
   const [e]=topo.violations[k],t=session.tiles[e.tile],active=k===focusedViolation;
   const seam=line(t,e.i,'#ca3544',active?5:camera.scale<40?1.5:2.8);
   if(!active&&camera.scale<40)seam.setAttribute('opacity','.75');world.append(seam);
   // At small scales keep every red seam, but show × labels only on demand.
   if(camera.scale>=40||active)world.append(crossMark(t,e.i,active?6:4));
  }
  if(focusedViolation!==null)for(const e of topo.violations[focusedViolation]||[])world.append(outline(session.tiles[e.tile],'#c63543',2,'#cf354516'));
 }
 if(session.failure){
  const {candidate,check}=session.failure;
  world.append(svgElement('path',{d:tilePath(candidate,settings.bumps),fill:'#e94a58','fill-opacity':.3,stroke:'#cf3344','stroke-width':2,'vector-effect':'non-scaling-stroke','pointer-events':'none','data-overlay':'candidate'}));
  for(const item of check.overlapping){
   world.append(outline(session.tiles[item.tile],'#bd2637',3));
   world.append(svgElement('polygon',{points:item.polygon.map(p=>p.join(',')).join(' '),fill:'#b90e2d','fill-opacity':.72,'pointer-events':'none','data-overlay':'intersection'}));
  }
  for(const e of [...check.mismatches,...check.partial]){
   world.append(outline(session.tiles[e.tile],'#d4434e',1.5));
   world.append(line(session.tiles[e.tile],e.existingEdge,'#c42d3c',5),line(candidate,e.candidateEdge,'#c42d3c',4),crossMark(candidate,e.candidateEdge,6));
  }
 }
 if(session.selected)world.append(line(session.tiles[session.selected.tile],session.selected.i,'#8750ce',3));
 if(deleting){if(hoverTile!==null&&session.tiles[hoverTile])world.append(outline(session.tiles[hoverTile],'#c63543',3,'#e14b5733'));}
 else {
  for(const e of topo.exposed)world.append(svgElement('path',{d:edgePath(session.tiles[e.tile],e.i,settings.bumps),class:'edge-hit',style:`stroke-width:${Math.max(.2,26/camera.scale)}`,tabindex:0,role:'button','aria-label':`${e.tile+1}枚目の${e.i+1}番の辺を選択`,'data-action':'edge','data-tile':e.tile,'data-edge':e.i}));
  if(session.strict)topo.violations.forEach(([e],k)=>world.append(svgElement('path',{d:edgePath(session.tiles[e.tile],e.i,settings.bumps),class:'edge-hit violation-hit',style:`stroke-width:${Math.max(.12,20/camera.scale)}`,tabindex:0,role:'button','aria-label':`違反辺${k+1}を拡大`,'data-action':'violation','data-violation':k})));
 }
 const thick=session.tiles.filter(t=>t.type==='thick').length,thin=session.tiles.length-thick;
 $('total').innerHTML=session.tiles.length+'<span>枚</span>';$('thickCount').textContent=thick;$('thinCount').textContent=thin;$('ratio').textContent=thin?`${(thick/thin).toFixed(3)} : 1`:'—';
 $('undo').disabled=!session.history.past.length;$('redo').disabled=!session.history.future.length;$('save').disabled=!session.tiles.length;
 $('cancel').hidden=!session.failure&&!session.selected&&!session.palette&&focusedViolation===null;$('emptyNote').hidden=!!session.tiles.length;
 $('stepTitle').textContent=deleting?'削除するタイルを選ぶ':!session.tiles.length?'最初の1枚を選ぶ':session.selected?'追加する辺を選ぶ':session.palette?'配置済みの辺を選ぶ':'2つの辺を選んでつなぐ';
 $('stepText').textContent=deleting?'タップで1枚削除。ドラッグは画面移動。':!session.tiles.length?'下の辺をタップすると自動で置かれます。':'どちらの辺を先に選んでも、自動で配置。';
 const count=session.strict?topo.violations.length:0;
 $('violationCount').hidden=!count;$('violationCount').textContent=`× 違反辺 ${count}本 · タップして確認`;
 $('availabilityLegend').hidden=!$('available').checked;
 if($('available').checked)$('availabilityLegend').innerHTML=`緑：次の1枚を配置可能 ／ 赤：候補なし${availabilityDone<topo.exposed.length?'（計算中…）':''}<br><small>局所判定です。無限拡張の保証ではありません。</small>`;
 for(const type of ['thick','thin'])drawPalette(type);
}
function drawPalette(type){
 const el=$('palette-'+type),t={type,x:0,y:0,angle:0};el.innerHTML=tileSVG(t,settings);
 for(let i=0;i<4;i++){
  const legal=session.selected?validate(attach(session.tiles[session.selected.tile],session.selected.i,type,i),session.tiles,session.strict,session.index).ok:null;
  const chosen=session.palette?.type===type&&session.palette.i===i;
  if(chosen)el.append(line(t,i,'#8750ce',2.5));
  const hit=svgElement('path',{d:edgePath(t,i,settings.bumps),class:'edge-hit','aria-hidden':true});hit.addEventListener('click',()=>choosePalette(type,i));el.append(hit);
  const [a,b]=edge(t,i),mid=mul(add(a,b),.5),v=sub(b,a),p=add(mid,mul([v[1],-v[0]],.13));
  const g=svgElement('g',{class:'edge-number',role:'button',tabindex:deleting?-1:0,'aria-disabled':deleting,'aria-pressed':chosen,'aria-label':`${type==='thick'?'太い':'細い'}菱形の${i+1}番の辺${legal===false?'（配置不可）':''}`});
  g.append(svgElement('circle',{cx:p[0],cy:p[1],r:.14,style:chosen?'fill:#e8d9f8;stroke:#8750ce':legal===false?'fill:#f6e7e6;stroke:#c48885':''}));
  const text=svgElement('text',{x:p[0],y:p[1]+.044,'text-anchor':'middle',class:'edge-index'});text.textContent=['①','②','③','④'][i];g.append(text);
  g.addEventListener('click',()=>choosePalette(type,i));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choosePalette(type,i);}});el.append(g);
 }
 let buttons=el.parentElement.querySelector('.edge-buttons');if(!buttons){buttons=document.createElement('div');buttons.className='edge-buttons';el.parentElement.append(buttons);}buttons.replaceChildren();
 for(let i=0;i<4;i++){const b=document.createElement('button');b.textContent=['①','②','③','④'][i];b.disabled=deleting;b.setAttribute('aria-label',`${type==='thick'?'太い':'細い'}菱形の辺${i+1}を選ぶ`);b.setAttribute('aria-pressed',session.palette?.type===type&&session.palette.i===i);b.onclick=()=>choosePalette(type,i);buttons.append(b);}
}
$('cancel').onclick=()=>{session.clear();focusedViolation=null;status('選択とエラー表示を解除しました。');schedule();};
$('undo').onclick=()=>{if(session.undo()){changed();status('1つ前の状態に戻しました。');}};
$('redo').onclick=()=>{if(session.redo()){changed();status('操作をやり直しました。');}};
$('reset').onclick=()=>{if(!session.tiles.length)return;session.set([]);changed();camera={x:0,y:0,scale:95};status('最初から始めます。Undoで作品を戻せます。');};
$('deleteMode').onclick=()=>{deleting=!deleting;session.clear();focusedViolation=null;hoverTile=null;$('deleteMode').classList.toggle('active',deleting);$('deleteMode').setAttribute('aria-pressed',deleting);status(deleting?'タイルをタップすると削除します。ドラッグは画面移動です。':'2つの辺を選んで配置してください。');schedule();};
function setMode(value){
 session.strict=value;settings.bumps=value;$('guides').disabled=!value;if(!value){$('guides').checked=false;settings.showGuides=false;}clearFeedback();session.clear();$('strict').classList.toggle('active',value);$('free').classList.toggle('active',!value);$('strict').setAttribute('aria-pressed',value);$('free').setAttribute('aria-pressed',!value);$('modeLabel').textContent=value?'P3 ・ マッチングルールあり':'自由な菱形 ・ マッチングルールなし';
 status(value&&topo.violations.length?`マッチング違反の共有辺が${topo.violations.length}本あります。赤い辺または違反数をタップして確認できます。`:value?'凹凸を合わせて配置します。局所的な一致を判定します。':'辺の一致と重なりだけを判定します。弧の不一致も許可します。',value&&!!topo.violations.length);
 if(value&&topo.violations.length)focusedViolation=0;updateAvailability();schedule();
}
$('strict').onclick=()=>setMode(true);$('free').onclick=()=>setMode(false);
$('arcs').onchange=e=>{settings.showArcs=e.target.checked;schedule();};$('colors').onchange=e=>{settings.color=e.target.checked;schedule();};$('guides').onchange=e=>{settings.showGuides=session.strict&&e.target.checked;e.target.checked=settings.showGuides;schedule();};$('available').onchange=()=>{updateAvailability();schedule();};
$('violationCount').onclick=()=>inspectViolation(focusedViolation===null?0:(focusedViolation+1)%topo.violations.length);
function fit(){const b=bounds(session.tiles,.5),r=board.getBoundingClientRect();camera.x=b.x+b.w/2;camera.y=b.y+b.h/2;camera.scale=Math.max(8,Math.min(260,(r.width-60)/b.w,(r.height-125)/b.h));schedule();}
function zoom(factor,anchor){const p=anchor||[camera.x,camera.y],old=camera.scale;camera.scale=Math.min(500,Math.max(8,old*factor));const ratio=old/camera.scale;camera.x=p[0]+(camera.x-p[0])*ratio;camera.y=p[1]+(camera.y-p[1])*ratio;schedule();}
$('fit').onclick=fit;$('center').onclick=()=>{const b=bounds(session.tiles);camera.x=b.x+b.w/2;camera.y=b.y+b.h/2;schedule();};$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(.8);
board.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.002),worldPoint(e.clientX,e.clientY));},{passive:false});
const pointers=new PointerGesture(6);let gesture=null,pressedAction=null,lastPointerUp=-Infinity;
function rebaseGesture(){gesture={camera:{...camera},start:[...pointers.points.values()].map(p=>[...p])};}
board.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse'&&e.button!==0)return;
 pointers.down(e.pointerId,[e.clientX,e.clientY]);pressedAction=pointers.points.size===1?e.target.closest('[data-action]'):null;
 if(e.isTrusted)board.setPointerCapture(e.pointerId);rebaseGesture();
 if(deleting&&pressedAction){hoverTile=+pressedAction.dataset.tile;schedule();}
});
board.addEventListener('pointermove',e=>{
 if(!pointers.points.has(e.pointerId)){
  if(deleting){const target=e.target.closest('[data-action="delete"]'),next=target?+target.dataset.tile:null;if(hoverTile!==next){hoverTile=next;schedule();}}return;
 }
 pointers.move(e.pointerId,[e.clientX,e.clientY]);if(!pointers.blocked||!gesture)return;
 const ps=[...pointers.points.values()],start=gesture.start;if(ps.length!==start.length)return;
 const mid=a=>mul(a.reduce(add,[0,0]),1/a.length),m=mid(ps),s=mid(start);
 const factor=ps.length===2?distance(ps[0],ps[1])/Math.max(1,distance(start[0],start[1])):1,scale=Math.max(8,Math.min(500,gesture.camera.scale*factor));
 const r=board.getBoundingClientRect(),offset=[s[0]-r.left-r.width/2,s[1]-r.top-r.height/2],now=[m[0]-r.left-r.width/2,m[1]-r.top-r.height/2];
 camera={x:gesture.camera.x+offset[0]/gesture.camera.scale-now[0]/scale,y:gesture.camera.y+offset[1]/gesture.camera.scale-now[1]/scale,scale};cameraTransform();
});
function endPointer(e,cancel=false){
 if(!pointers.points.has(e.pointerId))return;
 // Some devices deliver the final coordinate only in pointerup.
 pointers.move(e.pointerId,[e.clientX,e.clientY]);const click=pointers.up(e.pointerId,cancel);lastPointerUp=performance.now();
 if(click)activate(pressedAction);
 if(pointers.points.size)rebaseGesture();else {gesture=null;pressedAction=null;hoverTile=null;schedule();}
}
board.addEventListener('pointerup',e=>endPointer(e));board.addEventListener('pointercancel',e=>endPointer(e,true));
board.addEventListener('lostpointercapture',e=>{if(pointers.points.has(e.pointerId))endPointer(e,true);});
board.addEventListener('pointerleave',()=>{if(!pointers.points.size&&hoverTile!==null){hoverTile=null;schedule();}});
world.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const action=e.target.closest('[data-action]');if(action){e.preventDefault();activate(action);}}});
// Screen reader activation can emit a click without pointer events.
world.addEventListener('click',e=>{if(e.detail===0&&performance.now()-lastPointerUp>500)activate(e.target.closest('[data-action]'));});
new ResizeObserver(()=>schedule()).observe(board);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if(e.key==='Escape')$('cancel').click();});
$('help').onclick=()=>$('helpDialog').showModal();$('save').onclick=()=>{$('exportStatus').textContent='';$('saveDialog').showModal();};document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('example').onclick=()=>{session.set(sun(4));changed();fit();status('既知のsun配置（4回細分化・160枚）。Undoで前の作品に戻せます。');};
$('download').onclick=async()=>{
 const button=$('download');button.disabled=true;$('exportStatus').textContent='高解像度の画像を作成しています…';
 try{
  const {blob,width,height}=await createPNG(session.tiles,{...settings,background:$('background').value});
  const png=URL.createObjectURL(blob),a=document.createElement('a');a.href=png;a.download=filename();document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(png),60000);
  $('exportStatus').textContent=`${width} × ${height}px のPNGを保存しました。`;
 }catch(error){$('exportStatus').textContent=error.message||'画像を保存できませんでした。';}finally{button.disabled=false;}
};
if(restored.length)fit();schedule();
