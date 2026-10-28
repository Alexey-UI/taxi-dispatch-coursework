import {snapRoad,planRoute,routeLength,pointAlong} from './roads.mjs';
const $=s=>document.querySelector(s);
const statusNames={pending:'Поиск водителя',offered:'Предложен',accepted:'На подаче',arrived:'Водитель прибыл',in_progress:'В поездке',completed:'Завершён',cancelled:'Отменён'};
let state={drivers:[],orders:[],events:[],actor:{role:'observer'}},settings={running:false,scenario:'normal'},filter='all',picking=null;
const markers=new Map();
let city=null,zoom=1,view={x:0,y:0},drag=null,dragged=false;
const svgNS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},text){const el=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
async function api(path,body){const res=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000)});const result=await res.json();if(!res.ok)throw new Error(result.error||`Ошибка ${res.status}`);return result;}
function actionButton(text,action,order){const btn=document.createElement('button');btn.className='action';btn.textContent=text;btn.onclick=async()=>{btn.disabled=true;try{await api(`/orders/${order.id}/${action}`,{});await refresh();}catch(err){toast(err.message);}finally{btn.disabled=false;}};return btn;}
function renderCity(){
 const layer=$('#city-layer');layer.replaceChildren();
 const width=city.width*10,height=city.height*10;
 layer.append(svg('rect',{width,height,fill:'#edf0e9'}));
 for(let x=city.min_x;x<city.max_x;x+=city.street_step)for(let y=city.min_y;y<city.max_y;y+=city.street_step){
  const park=((x*7+y*3)%70===0);
  layer.append(svg('rect',{x:x*10+15,y:y*10+15,width:70,height:70,rx:park?20:9,fill:park?'#c7d9b8':((x+y)%30===0?'#d9e2d2':'#e0e6da')}));
  if(!park)layer.append(svg('rect',{x:x*10+28,y:y*10+28,width:44,height:44,rx:5,fill:'#d5dfcd',opacity:.7}));
 }
 for(let x=city.min_x;x<=city.max_x;x+=city.street_step){
  layer.append(svg('path',{d:`M${x*10},${city.min_y*10} V${city.max_y*10}`,stroke:'#fafcf7','stroke-width':22}));
 }
 for(let y=city.min_y;y<=city.max_y;y+=city.street_step){
  layer.append(svg('path',{d:`M${city.min_x*10},${y*10} H${city.max_x*10}`,stroke:'#fafcf7','stroke-width':22}));
 }
 for(const [x,y,label]of [[24,31,'СЕВЕРНЫЙ'],[130,31,'ВОСТОЧНЫЙ'],[45,111,'ЗАПАДНЫЙ'],[150,111,'ЮЖНЫЙ'],[89,71,'ЦЕНТР']])layer.append(svg('text',{x:x*10,y:y*10,class:'map-label'},label));
 for(const [axis,max]of [['x',city.max_x],['y',city.max_y]])for(const prefix of ['pickup','dropoff']){const input=$(`#order-form [name=${prefix}_${axis}]`);input.min=axis==='x'?city.min_x:city.min_y;input.max=max;input.step='any';}
 $('#coordinate-help').textContent=`X: ${city.min_x}–${city.max_x}, Y: ${city.min_y}–${city.max_y}. Точки привязываются к ближайшей дороге.`;
 setView();
}
function setView(){
 if(!city)return;const width=city.width*10/zoom,height=city.height*10/zoom;
 view.x=Math.max(0,Math.min(city.width*10-width,view.x));view.y=Math.max(0,Math.min(city.height*10-height,view.y));
 $('#map').setAttribute('viewBox',`${view.x} ${view.y} ${width} ${height}`);
 $('#zoom-out').disabled=zoom<=1;$('#zoom-in').disabled=zoom>=4;
}
function changeZoom(factor){if(!city)return;const oldWidth=city.width*10/zoom,oldHeight=city.height*10/zoom;zoom=Math.max(1,Math.min(4,zoom*factor));view.x+=(oldWidth-city.width*10/zoom)/2;view.y+=(oldHeight-city.height*10/zoom)/2;setView();}
function animate(now){
 for(const marker of markers.values()){
  const motion=marker.motion;
  if(motion){const ratio=Math.min(1,(now-motion.started)/1500);marker.display=pointAlong(motion.path,motion.length*ratio);if(ratio>=1)marker.motion=null;}
  if(marker.display)marker.setAttribute('transform',`translate(${marker.display.x*10} ${marker.display.y*10})`);
 }
 requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
function draw(){
 if(!city){city=state.city;renderCity();}
 $('#metric-drivers').textContent=state.drivers.filter(d=>d.status!=='offline').length;
 $('#metric-pending').textContent=state.orders.filter(o=>o.status==='pending').length;
 $('#metric-active').textContent=state.orders.filter(o=>['offered','accepted','arrived','in_progress'].includes(o.status)).length;
 $('#metric-completed').textContent=state.stats?.find(s=>s.status==='completed')?.count||0;
 $('#account').textContent=({observer:'Наблюдатель ↗',passenger:'Пассажир ↗',admin:'Диспетчер ↗',driver:`Водитель ${state.actor.driver_id||''} ↗`})[state.actor.role];
 const admin=state.actor.role==='admin';$('#simulation-toggle').disabled=!admin;$('#scenario').disabled=!admin;
 $('#simulation-toggle').textContent=admin?(settings.running?'Ⅱ Приостановить симуляцию':'▶ Запустить симуляцию'):'Войдите как диспетчер';
 $('#scenario').value=settings.scenario;$('#simulation-status').textContent=settings.running?'В ЭФИРЕ':'ПАУЗА';$('#simulation-status').classList.toggle('running',settings.running);
 $('#control-note').textContent=admin?'Пауза останавливает генерацию и движение. Обработчик назначения продолжает работу.':'Наблюдатели видят общую демонстрацию в реальном времени.';
 $('#route-layer').replaceChildren();$('#order-layer').replaceChildren();
 for(const order of state.orders){if(['completed','cancelled'].includes(order.status))continue;
  const driver=state.drivers.find(d=>d.id===order.driver_id);
  if(driver&&['accepted','arrived','in_progress'].includes(order.status)){
   const x=order.status==='in_progress'?order.dropoff_x:order.pickup_x,y=order.status==='in_progress'?order.dropoff_y:order.pickup_y;
   const route=planRoute(driver,{x,y},city);
   $('#route-layer').append(svg('path',{d:route.map((p,i)=>`${i?'L':'M'}${p.x*10},${p.y*10}`).join(' '),stroke:order.status==='in_progress'?'#6c9847':'#b29b47','stroke-width':5,'stroke-dasharray':'12 9',fill:'none','data-order-id':order.id}));
   $('#order-layer').append(svg('circle',{cx:x*10,cy:y*10,r:10,fill:order.status==='in_progress'?'#719b3e':'#d1a445',stroke:'white','stroke-width':3}));
  }
  if(order.status==='pending'||order.status==='offered'){
   const g=svg('g');g.append(svg('circle',{cx:order.pickup_x*10,cy:order.pickup_y*10,r:22,fill:'#a780b3',opacity:.2,class:'pulse'}),svg('circle',{cx:order.pickup_x*10,cy:order.pickup_y*10,r:9,fill:'#9771ac',stroke:'white','stroke-width':2}));$('#order-layer').append(g);
  }
 }
 for(const driver of state.drivers){
  let marker=markers.get(driver.id);
  if(!marker){marker=svg('g',{class:'driver-marker',filter:'url(#shadow)'});marker.append(svg('rect',{x:-26,y:-18,width:52,height:36,rx:11}),svg('text',{'text-anchor':'middle',y:7},driver.id.toUpperCase()),svg('text',{'text-anchor':'middle',y:40,class:'driver-label'},driver.name));marker.append(svg('title',{},`${driver.name} · ${driver.class}`));markers.set(driver.id,marker);$('#driver-layer').append(marker);}
  if(!marker.display)marker.display={x:driver.x,y:driver.y};
  if(!marker.target||marker.target.x!==driver.x||marker.target.y!==driver.y){const path=planRoute(marker.display,driver,city);marker.target={x:driver.x,y:driver.y};marker.motion={path,length:routeLength(path),started:performance.now()};}
  marker.querySelector('rect').setAttribute('fill',driver.status==='available'?'#65883f':driver.status==='offered'?'#ae8b3b':'#263f32');
 }
 const events=state.events.filter(e=>$('#event-filter').value==='all'||e.service===$('#event-filter').value);
 $('#events').replaceChildren();
 for(const event of events){const row=document.createElement('div');row.className='event';const dot=document.createElement('i');dot.className='event-dot';const body=document.createElement('div'),p=document.createElement('p'),meta=document.createElement('small'),service=document.createElement('b');p.textContent=event.message;service.textContent=event.service;meta.append(document.createTextNode(new Date(event.created_at).toLocaleTimeString('ru-RU')+' · '),service,document.createTextNode(event.order_id?' · #'+event.order_id.slice(0,6):''));body.append(p,meta);row.append(dot,body);$('#events').append(row);}
 if(!events.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='События появятся после создания заказа';$('#events').append(empty);}
 const orders=state.orders.filter(o=>filter==='all'||(filter==='mine'?o.mine:!['completed','cancelled'].includes(o.status)));$('#order-count').textContent=orders.length;$('#orders').replaceChildren();
 for(const order of orders){const tr=document.createElement('tr');const driver=state.drivers.find(d=>d.id===order.driver_id);for(const text of ['#'+order.id.slice(0,6),`${Math.round(order.pickup_x)}, ${Math.round(order.pickup_y)} → ${Math.round(order.dropoff_x)}, ${Math.round(order.dropoff_y)}`,order.class==='comfort'?'Комфорт':'Эконом',driver?`${driver.name} · ${driver.id}`:'—']){const td=document.createElement('td');td.textContent=text;tr.append(td);}const td=document.createElement('td'),badge=document.createElement('span');badge.className='status '+order.status;badge.textContent=statusNames[order.status];td.append(badge);tr.append(td);const actions=document.createElement('td');
  if(admin||(state.actor.role==='driver'&&state.actor.driver_id===order.driver_id)){
   const next={offered:[['Принять','accept'],['Отказ','decline']],accepted:[['Прибыл','arrive']],arrived:[['Начать','start']],in_progress:[['Завершить','complete']]}[order.status]||[];
   for(const [label,action]of next)actions.append(actionButton(label,action,order));
  }
  if((admin||order.mine)&&['pending','offered','accepted','arrived'].includes(order.status))actions.append(actionButton('Отменить','cancel',order));
  if(!actions.children.length)actions.textContent='—';tr.append(actions);$('#orders').append(tr);
 }
 if(!orders.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty';td.textContent='Заказов пока нет. Запустите сценарий или создайте первый заказ.';tr.append(td);$('#orders').append(tr);}
}
let refreshing=false;
async function refresh(){if(refreshing)return;refreshing=true;try{[state,settings]=await Promise.all([api('/state'),api('/simulation')]);draw();$('#connection-dot').classList.add('live');$('#connection-label').textContent='В реальном времени';}catch(err){$('#connection-dot').classList.remove('live');$('#connection-label').textContent='Переподключение…';}finally{refreshing=false;}}
$('#account').onclick=()=>$('#login-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#login-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await api('/auth/login',data);e.target.reset();$('#login-dialog').close();await refresh();toast('Вход выполнен');}catch(err){toast(err.message);}};
$('#logout').onclick=async()=>{try{await api('/auth/logout',{});$('#login-dialog').close();await refresh();}catch(err){toast(err.message);}};
$('#guest').onclick=async()=>{try{if(state.actor.role==='observer')await api('/auth/guest',{});$('#order-dialog').showModal();await refresh();}catch(err){toast(err.message);}};
$('#order-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));for(const k of ['pickup_x','pickup_y','dropoff_x','dropoff_y'])data[k]=Number(data[k]);try{const order=await api('/orders',data);$('#order-dialog').close();toast('Заказ #'+order.id.slice(0,6)+' создан');await refresh();}catch(err){toast(err.message);}};
async function simulation(running){try{await api('/simulation',{running,scenario:$('#scenario').value});await refresh();}catch(err){toast(err.message);}}
$('#simulation-toggle').onclick=()=>simulation(!settings.running);$('#scenario').onchange=()=>simulation(settings.running);
$('#event-filter').onchange=draw;
document.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===btn));draw();});
$('#pick-map').onclick=()=>{picking='pickup';$('#order-dialog').close();$('#map-hint').textContent='Нажмите на карту: точка подачи';$('#map').style.cursor='crosshair';};
$('#map').onclick=e=>{if(dragged){dragged=false;return;}if(!picking||!city)return;const point=$('#map').createSVGPoint();point.x=e.clientX;point.y=e.clientY;const p=point.matrixTransform($('#map').getScreenCTM().inverse());const {x,y}=snapRoad({x:Math.max(city.min_x,Math.min(city.max_x,p.x/10)),y:Math.max(city.min_y,Math.min(city.max_y,p.y/10))},city);const form=$('#order-form');form.elements[picking+'_x'].value=x;form.elements[picking+'_y'].value=y;if(picking==='pickup'){picking='dropoff';$('#map-hint').textContent='Теперь нажмите: точка назначения';}else{picking=null;$('#map').style.cursor='';$('#map-hint').textContent='Маршрут выбран на карте';$('#order-dialog').showModal();}};
$('#zoom-in').onclick=()=>changeZoom(1.4);$('#zoom-out').onclick=()=>changeZoom(1/1.4);$('#zoom-fit').onclick=()=>{zoom=1;view={x:0,y:0};setView();};
$('#map-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.map-panel').requestFullscreen();}catch{toast('Полноэкранный режим недоступен в этом браузере');}};
$('#map').addEventListener('pointerdown',e=>{if(picking||!city)return;drag={x:e.clientX,y:e.clientY,view:{...view}};dragged=false;$('#map').setPointerCapture(e.pointerId);});
$('#map').addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)dragged=true;const scale=$('#map').getScreenCTM().a;view.x=drag.view.x-dx/scale;view.y=drag.view.y-dy/scale;setView();});
$('#map').addEventListener('pointerup',()=>{drag=null;});$('#map').addEventListener('pointercancel',()=>{drag=null;});
setInterval(()=>$('#clock').textContent=new Date().toLocaleTimeString('ru-RU'),1000);
setInterval(()=>{if(!document.hidden)refresh();},1500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
await refresh();
