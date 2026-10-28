import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepToward,randomGenerator,makeOrder} from './engine.mjs';
test('movement reaches destination without overshoot',()=>{assert.deepEqual(stepToward({x:10,y:10},{x:13,y:14},10),{x:13,y:14,arrived:true});const p=stepToward({x:10,y:10},{x:13,y:14},2);assert.ok(Math.abs(Math.hypot(p.x-10,p.y-10)-2)<1e-10);});
test('seed produces reproducible valid routes',()=>{const a=randomGenerator(42),b=randomGenerator(42);for(let i=0;i<1000;i++){const x=makeOrder(a);assert.deepEqual(x,makeOrder(b));assert.ok(Math.hypot(x.pickup_x-x.dropoff_x,x.pickup_y-x.dropoff_y)>=3);for(const key of ['pickup_x','pickup_y','dropoff_x','dropoff_y'])assert.ok(x[key]>=5&&x[key]<=95);}});
