const $=s=>document.querySelector(s);
const statusNames={pending:'Поиск водителя',offered:'Предложен',accepted:'На подаче',arrived:'Водитель прибыл',in_progress:'В поездке',completed:'Завершён',cancelled:'Отменён'};
let state={drivers:[],orders:[],events:[],actor:{role:'observer'}},settings={running:false,scenario:'normal'},filter='all',picking=null;
const markers=new Map();
const svgNS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},text){const el=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
async function api(path,body){const res=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000)});const result=await res.json();if(!res.ok)throw new Error(result.error||`Ошибка ${res.status}`);return result;}
function actionButton(text,action,order){const btn=document.createElement('button');btn.className='action';btn.textContent=text;btn.onclick=async()=>{btn.disabled=true;try{await api(`/orders/${order.id}/${action}`,{});await refresh();}catch(err){toast(err.message);}finally{btn.disabled=false;}};return btn;}
function draw(){
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
   $('#route-layer').append(svg('path',{d:`M${driver.x*10},${driver.y*7.6} L${x*10},${y*7.6}`,stroke:'#a3ba74','stroke-width':3,'stroke-dasharray':'7 7',fill:'none'}));
  }
  if(order.status==='pending'||order.status==='offered'){
   const g=svg('g');g.append(svg('circle',{cx:order.pickup_x*10,cy:order.pickup_y*7.6,r:17,fill:'#a780b3',opacity:.2,class:'pulse'}),svg('circle',{cx:order.pickup_x*10,cy:order.pickup_y*7.6,r:6,fill:'#9771ac',stroke:'white','stroke-width':2}));$('#order-layer').append(g);
  }
 }
 for(const driver of state.drivers){
  let marker=markers.get(driver.id);
  if(!marker){marker=svg('g',{class:'driver-marker',filter:'url(#shadow)'});marker.append(svg('rect',{x:-17,y:-13,width:34,height:26,rx:8}),svg('text',{'text-anchor':'middle',y:4},driver.id.toUpperCase()),svg('text',{'text-anchor':'middle',y:28,class:'driver-label'},driver.name));marker.append(svg('title',{},`${driver.name} · ${driver.class}`));markers.set(driver.id,marker);$('#driver-layer').append(marker);}
  marker.setAttribute('transform',`translate(${driver.x*10} ${driver.y*7.6})`);marker.querySelector('rect').setAttribute('fill',driver.status==='available'?'#65883f':driver.status==='offered'?'#ae8b3b':'#263f32');
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
$('#map').onclick=e=>{if(!picking)return;const point=$('#map').createSVGPoint();point.x=e.clientX;point.y=e.clientY;const p=point.matrixTransform($('#map').getScreenCTM().inverse());const x=Math.max(5,Math.min(95,Math.round(p.x/10))),y=Math.max(5,Math.min(95,Math.round(p.y/7.6)));const form=$('#order-form');form.elements[picking+'_x'].value=x;form.elements[picking+'_y'].value=y;if(picking==='pickup'){picking='dropoff';$('#map-hint').textContent='Теперь нажмите: точка назначения';}else{picking=null;$('#map').style.cursor='';$('#map-hint').textContent='Маршрут выбран на карте';$('#order-dialog').showModal();}};
setInterval(()=>$('#clock').textContent=new Date().toLocaleTimeString('ru-RU'),1000);
setInterval(()=>{if(!document.hidden)refresh();},1500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
await refresh();
