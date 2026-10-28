import http from 'node:http';
import {randomGenerator,makeOrder} from './engine.mjs';
import {advanceOnRoad} from '../web/roads.mjs';

const base=process.env.API_URL||'http://api:8080';
const key=process.env.SERVICE_KEY;
if(!key || key.length<32)throw new Error('SERVICE_KEY must contain at least 32 characters');
const random=randomGenerator(Number(process.env.SIMULATION_SEED||42));
const log=(level,message,extra={})=>console.log(JSON.stringify({time:new Date().toISOString(),level,service:'simulator',message,...extra}));
async function api(path,body){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Service-Key':key},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(4000)});
 if(!response.ok)throw new Error(`API ${response.status} ${path}`);
 return response.json();
}
let tickNumber=0,lastSuccess=Date.now(),lastMotion=Date.now(),stopping=false;
async function tick(){
 const settings=await api('/api/simulation');
 const now=Date.now(),elapsed=Math.min(2,(now-lastMotion)/1000);lastMotion=now;
 if(!settings.running){lastSuccess=Date.now();return;}
 const state=await api('/api/state');
 const speed=Number(process.env.SIMULATION_SPEED||state.city.speed);
 if(!Number.isFinite(speed)||speed<=0||speed>10)throw new Error('SIMULATION_SPEED must be between 0 and 10');
 const active=state.orders.filter(o=>!['completed','cancelled'].includes(o.status));
 const every=settings.scenario==='burst'?2:settings.scenario==='shortage'?3:7;
 if(tickNumber++%every===0 && active.length<(settings.scenario==='burst'?45:settings.scenario==='shortage'?18:8)){
  const amount=settings.scenario==='burst'?5:1;
  for(let i=0;i<amount;i++) {try{const order=await api('/api/orders',makeOrder(random,state.city));log('info','order generated',{order_id:order.id,scenario:settings.scenario});}catch(err){log('warn',err.message);}}
 }
 for(const order of active){
  const driver=state.drivers.find(d=>d.id===order.driver_id);if(!driver)continue;
  if(settings.scenario==='shortage'&&!['d1','d2'].includes(driver.id))continue;
  const age=(Date.now()-Date.parse(order.updated_at))/1000;
  try{
   if(order.status==='offered'&&age>2){await api(`/api/orders/${order.id}/${settings.scenario==='refusals'&&random()<0.45?'decline':'accept'}`,{});}
   else if(order.status==='accepted'||order.status==='in_progress'){
    const target=order.status==='accepted'?{x:order.pickup_x,y:order.pickup_y}:{x:order.dropoff_x,y:order.dropoff_y};
    const p=advanceOnRoad(driver,target,state.city,speed*elapsed);await api(`/api/drivers/${driver.id}/position`,{x:p.x,y:p.y});
    if(p.arrived)await api(`/api/orders/${order.id}/${order.status==='accepted'?'arrive':'complete'}`,{});
   }else if(order.status==='arrived'&&age>2){await api(`/api/orders/${order.id}/start`,{});}
  }catch(err){log('warn',err.message,{order_id:order.id});}
 }
 lastSuccess=Date.now();
}
const health=http.createServer((req,res)=>{const ok=Date.now()-lastSuccess<30000;res.writeHead(ok?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({status:ok?'ok':'stale',service:'simulator'}));});
health.listen(8090,'0.0.0.0');
async function run(){while(!stopping){try{await tick();}catch(err){log('error',err.message);}await new Promise(r=>setTimeout(r,1000));}health.close();}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
log('info','simulator started');await run();
