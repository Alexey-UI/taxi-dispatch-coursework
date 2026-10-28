import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).trim().split('\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const base=process.env.BASE_URL||`http://127.0.0.1:${env.PORT||8088}`;
const service={'X-Service-Key':env.SERVICE_KEY};
let calls=0;
async function request(path,body,headers={},expected=200){
 await new Promise(r=>setTimeout(r,130));calls++;
 const result=await new Promise((resolve,reject)=>{const payload=body===undefined?undefined:JSON.stringify(body);const req=http.request(base+'/api'+path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(process.env.HOST_HEADER?{Host:process.env.HOST_HEADER}:{}),...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]}));});req.on('error',reject);req.setTimeout(8000,()=>req.destroy(new Error('HTTP timeout')));req.end(payload);});
 assert.equal(result.status,expected,`${path}: ${result.status}`);
 return {data:JSON.parse(result.text),cookie:result.cookie};
}
async function state(){return (await request('/state')).data;}
async function waitFor(fn,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();const value=fn(s);if(value)return value;await new Promise(r=>setTimeout(r,300));}throw new Error('Timeout waiting for state');}
const created=[];
try{
 await request('/simulation',{running:false,scenario:'normal'},service);
 await request('/simulation',{running:true,scenario:'normal'},{},403);
 const guest=await request('/auth/guest',{});assert.ok(guest.cookie);
 const cookies={Cookie:guest.cookie};
 await request('/orders',{pickup_x:0,pickup_y:20,dropoff_x:70,dropoff_y:70,class:'economy'},cookies,400);
 const initial=await state();
 const target=initial.drivers.find(d=>d.class==='comfort'&&d.status==='available');assert.ok(target,'free comfort driver');
 const order=(await request('/orders',{pickup_x:target.x,pickup_y:target.y,dropoff_x:75,dropoff_y:80,class:'comfort'},cookies,201)).data;created.push(order.id);
 const offered=await waitFor(s=>s.orders.find(o=>o.id===order.id&&o.status==='offered'));assert.equal(offered.driver_id,target.id,'nearest compatible driver');
 const outsider=await request('/auth/guest',{});
 await request(`/orders/${order.id}/cancel`,{},{Cookie:outsider.cookie},403);
 await request(`/orders/${order.id}/accept`,{},cookies,403);
 await request(`/orders/${order.id}/decline`,{},service);
 const again=await waitFor(s=>s.orders.find(o=>o.id===order.id&&o.status==='offered'&&o.driver_id!==target.id));assert.notEqual(again.driver_id,target.id);
 for(const action of ['accept','arrive','start','complete'])await request(`/orders/${order.id}/${action}`,{},service);
 await request(`/orders/${order.id}/accept`,{},service,409);
 const queue=[];
 for(let i=0;i<12;i++){const o=(await request('/orders',{pickup_x:15+i,pickup_y:25,dropoff_x:85,dropoff_y:70,class:'economy'},service,201)).data;created.push(o.id);queue.push(o.id);}
 await waitFor(s=>s.orders.filter(o=>queue.includes(o.id)&&o.status==='offered').length>=7);
 const snapshot=await state();const active=snapshot.orders.filter(o=>!['completed','cancelled','pending'].includes(o.status));const drivers=active.map(o=>o.driver_id);assert.equal(new Set(drivers).size,drivers.length,'one active order per driver');
 const timeoutOrder=snapshot.orders.find(o=>queue.includes(o.id)&&o.status==='offered');
 await waitFor(s=>s.events.some(e=>e.order_id===timeoutOrder.id&&e.kind==='offer_expired'),22000);
 assert.ok(!(JSON.stringify(snapshot).includes('owner_id')),'public state hides passenger identity');
 console.log(`PASS: lifecycle, nearest driver, class, refusal, timeout, concurrency, role isolation, public data (${calls} HTTP checks)`);
}finally{
 for(const id of created){try{const s=await state();const order=s.orders.find(o=>o.id===id);if(order&&['pending','offered','accepted','arrived'].includes(order.status))await request(`/orders/${id}/cancel`,{},service);}catch{}}
}
