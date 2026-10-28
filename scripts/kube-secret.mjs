import {readFile} from 'node:fs/promises';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).trim().split('\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
// Pipe directly into kubectl apply -f -. Never capture stdout in a chat/tool log.
const data={POSTGRES_PASSWORD:env.POSTGRES_PASSWORD,SESSION_KEY:env.SESSION_KEY,SERVICE_KEY:env.SERVICE_KEY,DEMO_PASSWORD:env.DEMO_PASSWORD,DATABASE_URL:`postgres://taxi:${env.POSTGRES_PASSWORD}@postgres:5432/taxi?sslmode=disable`};
process.stdout.write(JSON.stringify({apiVersion:'v1',kind:'Secret',metadata:{name:'taxi-secrets',namespace:process.env.NAMESPACE||'taxi'},type:'Opaque',stringData:data}));
