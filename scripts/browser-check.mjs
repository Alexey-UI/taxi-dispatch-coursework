import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {onRoad} from '../web/roads.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).trim().split('\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[];page.on('pageerror',err=>errors.push(err.message));
const base=process.env.BASE_URL||'http://127.0.0.1:8088';
await mkdir(new URL('../artifacts/screenshots/',import.meta.url),{recursive:true});
try{
 await page.goto(base);await page.getByText('В реальном времени',{exact:true}).waitFor();
 await page.locator('#account').click();await page.locator('[name=password]').fill(env.DEMO_PASSWORD);await page.locator('#login-form button[type=submit]').click();
 await page.locator('#simulation-toggle').filter({hasText:/Запустить|Приостановить/}).waitFor();
 if((await page.locator('#simulation-toggle').textContent()).includes('Приостановить')){await page.locator('#simulation-toggle').click();await page.locator('#simulation-toggle').filter({hasText:'Запустить'}).waitFor();}
 await page.locator('#simulation-toggle').click();
 await page.waitForFunction(()=>document.querySelectorAll('.driver-marker').length===8);
 await page.waitForFunction(()=>document.querySelectorAll('#orders tr').length>=2,null,{timeout:20000});
 await page.waitForFunction(()=>document.querySelectorAll('#route-layer path').length>0,null,{timeout:25000});
 const samples=await page.evaluate(()=>new Promise(resolve=>{
  const frames=[];let remaining=120;
  function sample(){frames.push([...document.querySelectorAll('.driver-marker')].map(m=>m.getAttribute('transform')));if(--remaining)requestAnimationFrame(sample);else resolve(frames);}
  requestAnimationFrame(sample);
 }));
 const snapshot=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
 for(const frame of samples)for(const transform of frame){const values=transform.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);assert.ok(values,transform);assert.ok(onRoad({x:Number(values[1])/10,y:Number(values[2])/10},snapshot.city),'animated car left the street');}
 assert.notDeepEqual(samples[0],samples.at(-1),'cars did not move during animation');
 assert.equal(snapshot.city.width,200);assert.equal(snapshot.city.height,140);
 const full=await page.locator('#map').getAttribute('viewBox');await page.locator('#zoom-in').click();assert.notEqual(await page.locator('#map').getAttribute('viewBox'),full);await page.locator('#zoom-fit').click();assert.equal(await page.locator('#map').getAttribute('viewBox'),full);

 await page.screenshot({path:fileURLToPath(new URL('../artifacts/screenshots/desktop.png',import.meta.url)),fullPage:true});
 await page.locator('#simulation-toggle').click();
 await page.locator('#guest').click();await page.locator('#order-form [type=submit]').click();
 await page.locator('#toast').filter({hasText:'создан'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile layout overflows');
 await page.screenshot({path:fileURLToPath(new URL('../artifacts/screenshots/mobile.png',import.meta.url)),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: road-only animation sampled over 120 frames, moving cars, expanded city, zoom, login, order creation, desktop/mobile; no page errors');
}finally{await browser.close();}
