import {snapRoad,planRoute,routeLength} from '../web/roads.mjs';
export function randomGenerator(seed = 42) {
  return () => { seed = (1664525*seed+1013904223) >>> 0; return seed/4294967296; };
}
export function makeOrder(random,city) {
  const point=()=>snapRoad({x:city.min_x+random()*(city.max_x-city.min_x),y:city.min_y+random()*(city.max_y-city.min_y)},city);
  const start=point();let end=point();
  // Keep normal trips long enough to watch; no zero-length snapped journeys.
  for(let i=0;i<20&&routeLength(planRoute(start,end,city))<45;i++)end=point();
  if(routeLength(planRoute(start,end,city))<45)end={x:start.x<city.width/2?city.max_x:city.min_x,y:city.min_y};
  return {pickup_x:start.x,pickup_y:start.y,dropoff_x:end.x,dropoff_y:end.y,class:random()<0.25?'comfort':'economy'};
}
