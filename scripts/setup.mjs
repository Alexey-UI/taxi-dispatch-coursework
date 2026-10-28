import {randomBytes} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
const path=new URL('../.env',import.meta.url);
try{await access(path);console.log('.env already exists; nothing changed');}catch{const key=()=>randomBytes(24).toString('hex');await writeFile(path,`POSTGRES_PASSWORD=${key()}\nSESSION_KEY=${key()}\nSERVICE_KEY=${key()}\nDEMO_PASSWORD=${key()}\nPORT=8088\n`,{mode:0o600,flag:'wx'});console.log('.env created. Open it locally to see DEMO_PASSWORD; do not publish this file.');}
