import {vertices,edge,RULES,sub,add,mul,distance,bounds} from './geometry.js';
export const COLORS={thick:'#edb865',thin:'#8dbfca'};
const pt=p=>p.map(x=>+x.toFixed(7)).join(' ');
// A profile is a deformation of the nominal edge. Its reversal is exactly the
// same curve for a matching neighbouring edge. No matching logic lives here.
export function edgePath(t,i,bumps=true) {
 const [a,b]=edge(t,i),v=sub(b,a),n=[v[1],-v[0]],{kind,sign}=RULES[t.type][i];
 if(!bumps)return `M ${pt(a)} L ${pt(b)}`;
 const center=sign===1?.34:.66, width=kind===1?.085:.09;
 const p=(u,h)=>pt(add(add(a,mul(v,u)),mul(n,h*sign)));
 const start=center-width,end=center+width;
 if(kind===1&&sign===-1)return `M ${pt(a)} L ${p(start,0)} L ${p(center-.025,.085)} Q ${p(center,.13)} ${p(center+.025,.105)} L ${p(end,0)} L ${pt(b)}`;
 if(kind===1)return `M ${pt(a)} L ${p(start,0)} L ${p(center-.025*sign,sign===1?.105:.085)} Q ${p(center,.13)} ${p(center+.025*sign,sign===1?.085:.105)} L ${p(end,0)} L ${pt(b)}`;
 return `M ${pt(a)} L ${p(start,0)} C ${p(start-.025,.115)} ${p(end+.025,.115)} ${p(end,0)} L ${pt(b)}`;
}
export function tilePath(t,bumps=true) {return [0,1,2,3].map((i)=>edgePath(t,i,bumps).replace(i?'M ':'M ',i?'L ':'M ')).join(' ')+' Z';}
// True circular arcs. Endpoints sit .22 or .78 edge units from the corners.
export function arcs(t){
 const ps=vertices(t), specs=t.type==='thin'?[[1,.22,'#247fa8'],[3,.22,'#d35d8c']]:[[0,.22,'#247fa8'],[2,.78,'#d35d8c']];
 return specs.map(([i,r,color])=>{
  const c=ps[i],a=add(c,mul(sub(ps[(i+3)%4],c),r)),b=add(c,mul(sub(ps[(i+1)%4],c),r));
  return `<path d="M ${pt(a)} A ${r} ${r} 0 0 0 ${pt(b)}" fill="none" stroke="${color}" stroke-width=".035"/>`;
 }).join('');
}
export function tileSVG(t,{bumps=true,showArcs=false,color=true,last=false,showGuides=false}={}) {
 return `<path d="${tilePath(t,bumps)}" fill="${color?COLORS[t.type]:'#faf9f6'}" stroke="${last?'#49685b':'#526166'}" stroke-width="${last?.027:.018}" stroke-linejoin="round"/>${bumps&&showGuides?`<path d="${tilePath(t,false)}" data-rhomb-outline="true" fill="none" stroke="#454b50" stroke-width=".022" stroke-dasharray=".066 .044"/>`:''}${showArcs?arcs(t):''}`;
}
export function exportSVG(tiles,settings,violations=[]){
 const b=bounds(tiles,.35),width=b.w>=b.h?4096:Math.max(1,Math.round(4096*b.w/b.h)),height=b.h>=b.w?4096:Math.max(1,Math.round(4096*b.h/b.w));
 return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${settings.background==='white'?`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="white"/>`:''}${tiles.map(t=>tileSVG(t,{...settings,last:false})).join('')}</svg>`};
}
export function filename(date=new Date()){const p=n=>String(n).padStart(2,'0');return `penrose-${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.png`;}
// Browser-only rasterization, shared by the app and browser regression tests.
export async function createPNG(tiles,settings,violations=[]) {
 const {svg,width,height}=exportSVG(tiles,settings,violations);
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 const canvas=document.createElement('canvas');
 try {
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('SVGの読み込みに失敗しました。'));img.src=url;});
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('画像作成に必要なメモリを確保できません。');
  if(settings.background==='white'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);}
  ctx.drawImage(img,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('PNGを作成できませんでした。');return {blob,width,height};
 } finally {URL.revokeObjectURL(url);canvas.width=canvas.height=1;}
}
