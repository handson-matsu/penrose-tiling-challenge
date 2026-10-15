import {attach,analyzePlacement,spatialIndex,History,distance} from './geometry.js';

// The two edge selections are independent. A successful attempt is one history
// operation; a failure leaves both the patch and the diagnostic intact.
export class TilingSession {
 constructor(tiles=[]){this.history=new History(tiles);this.strict=true;this.clear();this.index=spatialIndex(tiles);}
 get tiles(){return this.history.tiles;}
 clear(){this.selected=null;this.palette=null;this.failure=null;}
 refresh(){this.clear();this.index=spatialIndex(this.tiles);}
 set(tiles){this.history.set(tiles);this.refresh();}
 undo(){const ok=this.history.undo();if(ok)this.refresh();return ok;}
 redo(){const ok=this.history.redo();if(ok)this.refresh();return ok;}
 remove(i){if(!this.tiles[i])return false;this.set(this.tiles.filter((_,k)=>k!==i));return true;}
 chooseBoard(entry){this.failure=null;this.selected={tile:entry.tile,i:entry.i};return this.attempt();}
 choosePalette(type,i){this.failure=null;this.palette={type,i};return this.attempt();}
 attempt(){
  if(!this.palette||this.tiles.length&&!this.selected)return {state:'waiting'};
  const {type,i}=this.palette,candidate=this.tiles.length?attach(this.tiles[this.selected.tile],this.selected.i,type,i):{type,x:0,y:0,angle:0};
  const check=analyzePlacement(candidate,this.tiles,this.strict,this.index);
  if(!check.ok){this.failure={candidate,check};return {state:'failed',...this.failure};}
  this.set([...this.tiles,candidate]);return {state:'placed'};
 }
}
// No UI side effects. Movement is measured from each pointer's origin (not its
// last event), so a large outward-and-back gesture can never become a click.
export class PointerGesture {
 constructor(threshold=6){this.threshold=threshold;this.points=new Map();this.origins=new Map();this.blocked=false;}
 down(id,p){if(!this.points.size){this.blocked=false;this.origins.clear();}this.points.set(id,p);this.origins.set(id,p);if(this.points.size>1)this.blocked=true;}
 move(id,p){if(!this.points.has(id))return;this.points.set(id,p);if(distance(this.origins.get(id),p)>this.threshold)this.blocked=true;}
 up(id,cancel=false){const clicked=!cancel&&!this.blocked&&this.points.size===1;this.points.delete(id);this.origins.delete(id);return clicked;}
}
