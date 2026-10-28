import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomGenerator,makeOrder} from './engine.mjs';
import {snapRoad,onRoad,planRoute,routeLength,pointAlong,advanceOnRoad} from '../web/roads.mjs';
const city=JSON.parse(readFileSync(new URL('../internal/city.json',import.meta.url)));
const fixtures=JSON.parse(readFileSync(new URL('../internal/road-fixtures.json',import.meta.url)));
test('Go and JavaScript share road-distance fixtures, including a block detour',()=>{
 for(const f of fixtures)assert.equal(routeLength(planRoute(f.from,f.to,city)),f.distance);
});
test('routes and their interpolated animation stay on streets at every turn',()=>{
 const random=randomGenerator(24);
 for(let i=0;i<300;i++){
  const a=snapRoad({x:5+random()*190,y:5+random()*130},city),b=snapRoad({x:5+random()*190,y:5+random()*130},city);
  const path=planRoute(a,b,city),length=routeLength(path);
  assert.deepEqual(path[0],a);assert.deepEqual(path.at(-1),b);
  for(let j=1;j<path.length;j++)assert.ok(path[j-1].x===path[j].x||path[j-1].y===path[j].y,'diagonal segment');
  for(let budget=0;budget<=length;budget+=0.7)assert.ok(onRoad(pointAlong(path,budget),city));
 }
});
test('movement budget is preserved at a corner and never overshoots',()=>{
 const a={x:12,y:15},b={x:13,y:25};
 assert.deepEqual(advanceOnRoad(a,b,city,5),{x:15,y:17,arrived:false});
 assert.deepEqual(advanceOnRoad(a,b,city,100),{...b,arrived:true});
 assert.deepEqual(advanceOnRoad(a,a,city,1),{...a,arrived:true});
});
test('default speed gives a 45-unit trip at least 37.5 seconds of movement',()=>{
 assert.equal(city.speed,1.2);assert.ok(45/city.speed>=37.5);
 const path=planRoute({x:5,y:5},{x:65,y:5},city);
 assert.equal(routeLength(path)/city.speed,50);
});
test('seed produces reproducible street endpoints and watchable trips',()=>{
 const a=randomGenerator(42),b=randomGenerator(42);
 for(let i=0;i<1000;i++){
  const order=makeOrder(a,city);assert.deepEqual(order,makeOrder(b,city));
  const start={x:order.pickup_x,y:order.pickup_y},end={x:order.dropoff_x,y:order.dropoff_y};
  assert.ok(onRoad(start,city)&&onRoad(end,city));assert.ok(routeLength(planRoute(start,end,city))>=45);
 }
});
