export function stepToward(current, target, speed = 4) {
  const dx = target.x-current.x, dy = target.y-current.y, distance = Math.hypot(dx,dy);
  if (distance <= speed) return {x:target.x,y:target.y,arrived:true};
  return {x:current.x+dx/distance*speed,y:current.y+dy/distance*speed,arrived:false};
}
export function randomGenerator(seed = 42) {
  return () => { seed = (1664525*seed+1013904223) >>> 0; return seed/4294967296; };
}
export function makeOrder(random) {
  const point=()=>Math.round(8+random()*84);
  const order={pickup_x:point(),pickup_y:point(),dropoff_x:point(),dropoff_y:point(),class:random()<0.25?'comfort':'economy'};
  if(Math.hypot(order.pickup_x-order.dropoff_x,order.pickup_y-order.dropoff_y)<3)order.dropoff_x=order.pickup_x<50?90:10;
  return order;
}
