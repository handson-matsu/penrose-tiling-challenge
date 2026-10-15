// All coordinates are in units of one undecorated rhomb edge.
export const PHI = (1 + Math.sqrt(5)) / 2;
export const EPS = 1e-7;
export const add = (a,b) => [a[0]+b[0],a[1]+b[1]];
export const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
export const mul = (a,k) => [a[0]*k,a[1]*k];
export const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
export const distance = (a,b) => Math.hypot(...sub(a,b));
export const near = (a,b) => distance(a,b)<EPS;
export const rotate = (p,a) => [p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
// Clockwise on screen: acute left, obtuse top, acute right, obtuse bottom.
export function vertices(t) {
 const a=(t.type==='thick'?72:36)*Math.PI/360;
 return [[-Math.cos(a),0],[0,-Math.sin(a)],[Math.cos(a),0],[0,Math.sin(a)]].map(p=>add(rotate(p,t.angle||0),[t.x||0,t.y||0]));
}
export const edge = (t,i) => {const p=vertices(t);return [p[i],p[(i+1)%4]];};
// Standard P3 single/double-arrow equivalents, in clockwise boundary order.
// sign encodes direction; type encodes single/double. Opposite traversal reverses sign.
export const RULES = Object.freeze({
 thin: [{kind:1,sign:1},{kind:1,sign:-1},{kind:2,sign:1},{kind:2,sign:-1}],
 thick:[{kind:1,sign:-1},{kind:2,sign:-1},{kind:2,sign:1},{kind:1,sign:1}]
});
export const matches = (a,i,b,j) => RULES[a.type][i].kind===RULES[b.type][j].kind && RULES[a.type][i].sign===-RULES[b.type][j].sign;
export function attach(base,i,type,j) {
 const [a,b]=edge(base,i), t={type,x:0,y:0,angle:0};
 const [c,d]=edge(t,j), target=sub(a,b), source=sub(d,c);
 t.angle=Math.atan2(target[1],target[0])-Math.atan2(source[1],source[0]);
 const cr=rotate(c,t.angle); [t.x,t.y]=sub(b,cr); return t;
}
export function overlaps(a,b) {
 const pa=vertices(a),pb=vertices(b);
 for(const polygon of [pa,pb]) for(let i=0;i<4;i++) {
  const v=sub(polygon[(i+1)%4],polygon[i]), n=[-v[1],v[0]];
  const aa=pa.map(p=>dot(p,n)),bb=pb.map(p=>dot(p,n));
  if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=EPS) return false;
 } return true;
}
const pointKey=p=>p.map(x=>Math.round(x*1e6)).join(',');
export const edgeKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|');
export function topology(tiles) {
 const map=new Map();
 tiles.forEach((t,k)=>{for(let i=0;i<4;i++){const [a,b]=edge(t,i),key=edgeKey(a,b);if(!map.has(key))map.set(key,[]);map.get(key).push({tile:k,i,a,b});}});
 const exposed=[], violations=[], shared=[];
 for(const entries of map.values()) {
  if(entries.length===1)exposed.push(entries[0]);
  else {shared.push(entries);const [a,b]=entries;if(entries.length!==2||!matches(tiles[a.tile],a.i,tiles[b.tile],b.i)) violations.push(entries);}
 } return {exposed,violations,shared};
}
export function validate(candidate,tiles,strict=true,index=null) {
 const cp=vertices(candidate);let contacts=0;
 for(const tile of (index?index.query(candidate):tiles.map((_,i)=>i))) {
  const t=tiles[tile];
  // Bounding circles cheaply exclude distant pieces before SAT and boundary checks.
  if(Math.hypot(candidate.x-t.x,candidate.y-t.y)>4)continue;
  if(overlaps(candidate,t))return {ok:false,reason:'ほかのピースと重なっています。'};
  const tp=vertices(t);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
   const a=cp[i],b=cp[(i+1)%4],c=tp[j],d=tp[(j+1)%4];
   if(near(a,d)&&near(b,c)) {
    contacts++;
    if(strict&&!matches(candidate,i,t,j))return {ok:false,reason:'凹凸の種類、または向きが一致しません。'};
   } else {
    const v=sub(b,a),w=sub(c,a),z=sub(d,a),cross=p=>v[0]*p[1]-v[1]*p[0];
    if(Math.abs(cross(w))<EPS&&Math.abs(cross(z))<EPS) {
     const u=dot(w,v),q=dot(z,v);
     if(Math.min(1,Math.max(u,q))-Math.max(0,Math.min(u,q))>EPS)
      return {ok:false,reason:'辺の一部分だけが接しています。辺全体を一致させてください。'};
    }
   }
  }
 }
 if(tiles.length&&!contacts)return {ok:false,reason:'配置済みの辺と接続していません。'};
 return {ok:true,reason:'配置できます。'};
}
export class History {
 constructor(tiles=[]){this.tiles=tiles;this.past=[];this.future=[];}
 set(tiles){this.past.push(this.tiles);this.tiles=tiles;this.future=[];}
 undo(){if(!this.past.length)return false;this.future.push(this.tiles);this.tiles=this.past.pop();return true;}
 redo(){if(!this.future.length)return false;this.past.push(this.tiles);this.tiles=this.future.pop();return true;}
}
export function bounds(tiles,pad=.25) {
 const pts=tiles.flatMap(vertices);if(!pts.length)return {x:-2,y:-2,w:4,h:4};
 const xx=pts.map(p=>p[0]),yy=pts.map(p=>p[1]);const x=Math.min(...xx)-pad,y=Math.min(...yy)-pad;
 return {x,y,w:Math.max(...xx)-x+pad,h:Math.max(...yy)-y+pad};
}

export function polygonArea(points) {
 return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
}
// Sutherland–Hodgman clipping of convex, clockwise-in-screen-coordinate polygons.
// A positive area intersection is required: edge/vertex contact is not an overlap.
export function intersectionPolygon(subject,clip) {
 let result=subject.map(p=>[...p]);
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 for(let i=0;i<clip.length&&result.length;i++) {
  const a=clip[i],v=sub(clip[(i+1)%clip.length],a),input=result;result=[];
  let previous=input.at(-1),dp=cross(v,sub(previous,a));
  for(const current of input) {
   const dc=cross(v,sub(current,a)),inside=dc>=-EPS,wasInside=dp>=-EPS;
   if(inside!==wasInside){const fraction=dp/(dp-dc);result.push(add(previous,mul(sub(current,previous),fraction)));}
   if(inside)result.push(current);
   previous=current;dp=dc;
  }
 }
 const unique=result.filter((p,i)=>!i||!near(p,result[i-1]));
 if(unique.length>1&&near(unique[0],unique.at(-1)))unique.pop();
 return unique.length>=3&&polygonArea(unique)>EPS*EPS?unique:[];
}
// Immutable placement snapshots have a reusable spatial index. Query only local
// centers (rhomb radius < 1); holes and disconnected components need no special case.
export function spatialIndex(tiles) {
 const cells=new Map(),size=2;
 tiles.forEach((t,i)=>{const key=`${Math.floor(t.x/size)},${Math.floor(t.y/size)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);});
 return {tiles,query(t){const found=[];for(let x=Math.floor((t.x-2)/size);x<=Math.floor((t.x+2)/size);x++)for(let y=Math.floor((t.y-2)/size);y<=Math.floor((t.y+2)/size);y++)found.push(...(cells.get(`${x},${y}`)||[]));return found;}};
}
export function analyzePlacement(candidate,tiles,strict=true,index=null) {
 const cp=vertices(candidate),overlapping=[],mismatches=[],partial=[];let contacts=0;
 const indices=index?index.query(candidate):tiles.map((_,i)=>i);
 for(const tile of indices) {
  const t=tiles[tile];if(Math.hypot(candidate.x-t.x,candidate.y-t.y)>2+EPS)continue;
  if(overlaps(candidate,t)){overlapping.push({tile,polygon:intersectionPolygon(cp,vertices(t))});continue;}
  const tp=vertices(t);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
   const a=cp[i],b=cp[(i+1)%4],c=tp[j],d=tp[(j+1)%4];
   if(near(a,d)&&near(b,c)) {
    contacts++;if(strict&&!matches(candidate,i,t,j))mismatches.push({tile,candidateEdge:i,existingEdge:j});
   } else {
    const v=sub(b,a),w=sub(c,a),z=sub(d,a),cross=p=>v[0]*p[1]-v[1]*p[0];
    if(Math.abs(cross(w))<EPS&&Math.abs(cross(z))<EPS) {
     const u=dot(w,v),q=dot(z,v);
     if(Math.min(1,Math.max(u,q))-Math.max(0,Math.min(u,q))>EPS)partial.push({tile,candidateEdge:i,existingEdge:j});
    }
   }
  }
 }
 const code=overlapping.length?'overlap':mismatches.length?'matching':partial.length?'partial':tiles.length&&!contacts?'disconnected':'ok';
 const reason={overlap:`既存のタイルと重なっています（${overlapping.length}枚）。`,matching:`凹凸の種類、または向きが一致しません（${mismatches.length}辺）。`,partial:'辺の一部分だけが接しています。辺全体を一致させてください。',disconnected:'配置済みの辺と接続していません。',ok:'配置できます。'}[code];
 return {ok:code==='ok',code,reason,overlapping,mismatches,partial,contacts};
}
export function placementOptions(tiles,entry,strict=true,index=null) {
 return ['thick','thin'].flatMap(type=>[0,1,2,3].map(i=>{
  const tile=attach(tiles[entry.tile],entry.i,type,i);
  return {type,i,ok:validate(tile,tiles,strict,index).ok};
 }));
}
