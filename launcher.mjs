import {createApp} from './server.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);
const open=key=>{const url='http://127.0.0.1:3877/#key='+key;spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath '${url}'`],{windowsHide:true,stdio:'ignore'}).unref()};
let existing=false;if(existsSync('data/keys.json')){try{const k=JSON.parse(readFileSync('data/keys.json')).admin;const r=await fetch('http://127.0.0.1:3877/api/state',{headers:{Authorization:'Bearer '+k},signal:AbortSignal.timeout(1000)});if(r.ok){open(k);existing=true;console.log('Qoldau Live is already running. Opened the dashboard.')}}catch{}}
if(!existing){const app=createApp();app.server.on('error',e=>{console.error('Cannot start Qoldau Live:',e.message);app.db.close();process.exit(1)});await app.listen();open(app.keys.admin);console.log('Qoldau Live is running. Keep this window open.');console.log('Close this window or press Ctrl+C to stop the local server.');console.log('Dashboard: http://127.0.0.1:3877');process.on('SIGINT',async()=>{await app.close();process.exit(0)})}
