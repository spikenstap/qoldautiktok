import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from './server.mjs';
import {createWidgetGateway} from './widget-gateway.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);mkdirSync('data',{recursive:true});
const stateFile=path.join(root,'data','https-state.json'),keyFile=path.join(root,'data','https-key.json');
const openDashboard=key=>spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath 'http://127.0.0.1:3877/#key=${key}'`],{windowsHide:true,stdio:'ignore'}).unref();
let app,gateway,tunnel,heartbeat,closing=false,publicUrl='',registered=false,writtenUrl='';
const report=status=>{writeFileSync(stateFile,JSON.stringify({url:publicUrl,token:publicUrl?token:'',status,updatedAt:Date.now()}));if(publicUrl&&status==='connected'&&writtenUrl!==publicUrl){writeFileSync(path.join(root,'HTTPS-LINKS.txt'),[
 'HTTPS-ССЫЛКИ ДЛЯ LIVE STUDIO','Адрес временный. После нового запуска START-HTTPS.cmd скопируй ссылки заново.','Добавить источник → Ссылка. Не публикуй токены зрителям.','',
 'Донаты и озвучка — 640 × 600',publicUrl+'/overlay?widget=alerts&transparent=1&embed=1&token='+token,'',
 'Цель — 480 × 240',publicUrl+'/widget?type=goal&token='+token,'',
 'Топ — 420 × 620',publicUrl+'/widget?type=top&token='+token,'',
 'Музыка — 520 × 380',publicUrl+'/overlay?widget=music&transparent=1&embed=1&token='+token,'',
 'Общий экран — 1280 × 1080',publicUrl+'/overlay?widget=all&transparent=1&embed=1&token='+token,
 '','Общий экран занимает оба звуковых канала: не открывай его одновременно с отдельным виджетом донатов.','Включи звук источника. Для проверки используй тестовый донат в панели.',''].join('\r\n'));writtenUrl=publicUrl}};
const close=async()=>{if(closing)return;closing=true;clearInterval(heartbeat);tunnel?.kill();report('HTTPS-ссылки выключены. Запусти START-HTTPS.cmd.');await gateway?.close();await app?.close()};
let token='';
try{
 let keys;try{keys=JSON.parse(readFileSync('data/keys.json'));const r=await fetch('http://127.0.0.1:3877/api/state',{headers:{Authorization:'Bearer '+keys.admin},signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('offline')}catch{app=createApp();await app.listen();keys=app.keys}
 try{const old=JSON.parse(readFileSync(stateFile));if(Date.now()-old.updatedAt<15000&&old.url&&old.status==='connected'){console.log('HTTPS links are already running.');openDashboard(keys.admin);process.exit(0)}}catch{}
 if(!existsSync(keyFile))writeFileSync(keyFile,JSON.stringify({token:randomBytes(32).toString('hex')}));token=JSON.parse(readFileSync(keyFile)).token;
 const exe=path.join(root,'runtime','cloudflared.exe');if(!existsSync(exe))throw Error('runtime/cloudflared.exe is missing');
 gateway=createWidgetGateway({upstream:'http://127.0.0.1:3877',overlayKey:keys.overlay,token});await gateway.listen();report('Подключаю HTTPS…');
 tunnel=spawn(exe,['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:3880'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let buffer='';const log=chunk=>{const text=chunk.toString();process.stdout.write(text);buffer=(buffer+text).slice(-12000);const found=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(found&&!publicUrl){publicUrl=found[0];report('Адрес получен. Подключаю туннель…')}if(text.includes('Registered tunnel connection')){registered=true;report('connected')}};
 tunnel.stdout.on('data',log);tunnel.stderr.on('data',log);tunnel.on('error',e=>{console.error(e.message);close()});tunnel.on('exit',()=>{if(!closing){console.error('HTTPS tunnel stopped.');close()}});
 heartbeat=setInterval(()=>report(registered?'connected':'Подключаю HTTPS…'),5000);
 openDashboard(keys.admin);console.log('Keep this window open. Close it or press Ctrl+C to stop HTTPS widgets.');
 process.on('SIGINT',async()=>{await close();process.exit(0)});process.on('SIGTERM',async()=>{await close();process.exit(0)});process.on('exit',()=>tunnel?.kill());
}catch(e){console.error(e.message);await close();process.exitCode=1}
