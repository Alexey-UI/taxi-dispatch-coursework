// Geometry shared by the renderer and the Node.js simulator.
// Configuration comes from the Go API; the browser never invents a second map.
const EPS=1e-8;
const same=(a,b)=>Math.abs(a-b)<EPS;
const axis=(value,origin,city)=>same((value-origin)/city.street_step,Math.round((value-origin)/city.street_step));
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function snapRoad(p,city){
 const x=Math.max(city.min_x,Math.min(city.max_x,city.min_x+Math.round((p.x-city.min_x)/city.street_step)*city.street_step));
 const y=Math.max(city.min_y,Math.min(city.max_y,city.min_y+Math.round((p.y-city.min_y)/city.street_step)*city.street_step));
 return Math.abs(p.x-x)<=Math.abs(p.y-y)?{x,y:p.y}:{x:p.x,y};
}
export function onRoad(p,city){return p.x>=city.min_x-EPS&&p.x<=city.max_x+EPS&&p.y>=city.min_y-EPS&&p.y<=city.max_y+EPS&&(axis(p.x,city.min_x,city)||axis(p.y,city.min_y,city));}
function entrances(p,city){
 if(axis(p.x,city.min_x,city)&&axis(p.y,city.min_y,city))return [p];
 if(axis(p.x,city.min_x,city)){const y=city.min_y+Math.floor((p.y-city.min_y)/city.street_step)*city.street_step;return [{x:p.x,y},{x:p.x,y:Math.min(city.max_y,y+city.street_step)}];}
 const x=city.min_x+Math.floor((p.x-city.min_x)/city.street_step)*city.street_step;return [{x,y:p.y},{x:Math.min(city.max_x,x+city.street_step),y:p.y}];
}
export function routeLength(path){return path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);}
export function planRoute(from,to,city){
 const start=snapRoad(from,city),end=snapRoad(to,city);
 if((same(start.x,end.x)&&axis(start.x,city.min_x,city))||(same(start.y,end.y)&&axis(start.y,city.min_y,city)))return [start,end];
 let best=null,length=Infinity;
 for(const a of entrances(start,city))for(const b of entrances(end,city)){
  const path=[start,a,{x:b.x,y:a.y},b,end].filter((p,i,items)=>i===0||distance(p,items[i-1])>EPS);
  const candidate=routeLength(path);if(candidate<length-EPS){best=path;length=candidate;}
 }
 return best;
}
export function pointAlong(path,budget){
 for(let i=1;i<path.length;i++){
  const from=path[i-1],to=path[i],length=distance(from,to);
  if(length>budget&&length>EPS){const fraction=Math.max(0,budget)/length;return {x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction};}
  budget-=length;
 }
 return {...path.at(-1)};
}
export function advanceOnRoad(current,target,city,budget){
 const path=planRoute(current,target,city),length=routeLength(path);
 return {...pointAlong(path,budget),arrived:budget>=length-EPS};
}
