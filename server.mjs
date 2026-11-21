import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync,createReadStream,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createPhoneService} from './phone-service.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
export function youtubeId(value){
  if(!value)return '';
  let u;try{u=new URL(value)}catch{throw Error('Укажите полную ссылку YouTube.')}
  if(u.protocol!=='https:'||u.username||u.password)throw Error('Нужна HTTPS-ссылка YouTube.');
  let id='';if(u.hostname==='youtu.be')id=u.pathname.slice(1);
  else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1];
  if(!/^[\w-]{11}$/.test(id||''))throw Error('Не удалось распознать видео YouTube.');return id;
}
export function kkNumber(n){
 const ones=['','бір','екі','үш','төрт','бес','алты','жеті','сегіз','тоғыз'];const tens=['','он','жиырма','отыз','қырық','елу','алпыс','жетпіс','сексен','тоқсан'];
 if(!n)return 'нөл';if(n>=1000000)return `${kkNumber(Math.floor(n/1000000))} миллион${n%1000000?' '+kkNumber(n%1000000):''}`;
 if(n>=1000)return `${Math.floor(n/1000)===1?'':kkNumber(Math.floor(n/1000))+' '}мың${n%1000?' '+kkNumber(n%1000):''}`;
 return [n>=100?(Math.floor(n/100)===1?'жүз':ones[Math.floor(n/100)]+' жүз'):'',tens[Math.floor(n%100/10)],ones[n%10]].filter(Boolean).join(' ');
}
const defaults={title:'Қолдау LIVE',paymentUrl:'',qr:'',goalName:'Цель эфира',goalAmount:50000,ttsEnabled:false,voice:'iseke',ttsRate:1,ttsVolume:.8,messageLimit:220,musicMinimum:500,musicMaxSeconds:300,musicVolume:40,autoApproveMusic:false,blockedVideos:[],showGoal:true,ranges:[{min:100,max:499,seconds:8,width:480,x:50,y:30,effect:'rise',media:'',sound:''},{min:500,max:999,seconds:10,width:520,x:50,y:30,effect:'pulse',media:'',sound:''},{min:1000,max:4999,seconds:12,width:560,x:50,y:30,effect:'burst',media:'',sound:''},{min:5000,max:1000000,seconds:15,width:600,x:50,y:30,effect:'burst',media:'',sound:''}]};
function fail(message,status=400){let e=Error(message);e.status=status;throw e}
function str(v,max=300){return String(v??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function num(v,min,max){let n=Number(v);if(!Number.isFinite(n)||n<min||n>max)fail(`Число должно быть от ${min} до ${max}.`);return n}
function asset(v){if(!v)return '';if(!/^\/media\/[a-f0-9-]+\.(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg)$/.test(v))fail('Выберите загруженный файл.');return v}
function validateSettings(v){
 const s={...defaults};s.title=str(v.title,60)||defaults.title;s.goalName=str(v.goalName,80);s.goalAmount=num(v.goalAmount,1,100000000);s.qr=asset(v.qr);
 s.paymentUrl=str(v.paymentUrl,400);if(s.paymentUrl){let u;try{u=new URL(s.paymentUrl)}catch{fail('Неверная ссылка оплаты.')};if(u.protocol!=='https:'||!['kaspi.kz','pay.kaspi.kz'].includes(u.hostname)||u.username||u.password)fail('Нужна HTTPS-ссылка kaspi.kz или pay.kaspi.kz.')}
 for(const key of ['ttsEnabled','autoApproveMusic','showGoal'])s[key]=v[key]===true;
 s.voice=['iseke','raya','browser'].includes(v.voice)?v.voice:'iseke';
 for(const [k,min,max] of [['ttsRate',.5,2],['ttsVolume',0,1],['messageLimit',20,500],['musicMinimum',1,1000000],['musicMaxSeconds',10,1800],['musicVolume',0,100]])s[k]=num(v[k],min,max);
 s.blockedVideos=(Array.isArray(v.blockedVideos)?v.blockedVideos:[]).slice(0,200).map(x=>/^[\w-]{11}$/.test(x)?x:youtubeId(x));
 if(!Array.isArray(v.ranges)||!v.ranges.length||v.ranges.length>12)fail('Нужно от 1 до 12 диапазонов.');
 s.ranges=v.ranges.map(r=>({min:Math.round(num(r.min,1,1000000)),max:Math.round(num(r.max,1,1000000)),seconds:num(r.seconds,2,120),width:num(r.width,240,1200),x:num(r.x,0,100),y:num(r.y,0,100),effect:['rise','pulse','burst'].includes(r.effect)?r.effect:'rise',media:asset(r.media),sound:asset(r.sound)})).sort((a,b)=>a.min-b.min);
 s.ranges.forEach((r,i)=>{if(r.min>r.max||(i&&r.min<=s.ranges[i-1].max))fail('Диапазоны сумм не должны пересекаться.')});return s;
}
export function createApp({dataDir=process.env.QOLDAU_DATA||path.join(ROOT,'data'),port=Number(process.env.PORT||3877),phoneBridgeFactory}={}){
 mkdirSync(dataDir,{recursive:true});for(const d of ['media','audio'])mkdirSync(path.join(dataDir,d),{recursive:true});
 const secretFile=path.join(dataDir,'keys.json');if(!existsSync(secretFile))writeFileSync(secretFile,JSON.stringify({admin:randomBytes(32).toString('hex'),overlay:randomBytes(32).toString('hex')}));
 const keys=JSON.parse(readFileSync(secretFile));
 const db=new DatabaseSync(path.join(dataDir,'qoldau.sqlite'));db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS donations(id TEXT PRIMARY KEY,name TEXT,amount INTEGER,message TEXT,video TEXT,status TEXT,reference TEXT UNIQUE,test INTEGER,session TEXT,created TEXT); CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,donation TEXT,status TEXT,created INTEGER); CREATE TABLE IF NOT EXISTS music(id TEXT PRIMARY KEY,donation TEXT,video TEXT,status TEXT,note TEXT,created INTEGER);`);
 const read=(k,d)=>{const r=db.prepare('SELECT v FROM kv WHERE k=?').get(k);return r?JSON.parse(r.v):d};
 const save=(k,v)=>db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,JSON.stringify(v));
 let settings=read('settings',structuredClone(defaults));let session=read('session',randomUUID());save('session',session);
 let control={stop:0,skipTts:0,skipMusic:0,paused:false,halted:false};
 const leases={alerts:{id:'',at:0,status:'Окно донатов не подключено'},music:{id:'',at:0,status:'Окно музыки не подключено'}};
 const live=l=>Date.now()-l.at<6500;
 function playerState(){const lease=live(leases.alerts)?leases.alerts:leases.music;return {...lease,connected:live(leases.alerts)||live(leases.music),channels:{alerts:live(leases.alerts),music:live(leases.music)}}}
 function widgetState(){return {title:settings.title,goalName:settings.goalName,goalAmount:settings.goalAmount,showGoal:settings.showGoal,total:total(),top:db.prepare("SELECT name,SUM(amount) amount FROM donations WHERE status IN ('confirmed','detected') AND test=0 AND session=? GROUP BY name ORDER BY amount DESC,name LIMIT 10").all(session)}}
 // A crashed or reloaded player is not automatically replayed: favour no duplicate alerts.
 db.exec("UPDATE alerts SET status='interrupted' WHERE status='playing'; UPDATE music SET status='interrupted',note='Приложение перезапущено' WHERE status='playing'");
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
 function total(){return Number(db.prepare("SELECT COALESCE(SUM(amount),0) n FROM donations WHERE status IN ('confirmed','detected') AND test=0 AND session=?").get(session).n)}
 function state(){return {settings,total:total(),session,control,player:playerState(),donations:db.prepare('SELECT * FROM donations ORDER BY created DESC LIMIT 300').all(),music:db.prepare('SELECT m.*,d.name,d.test FROM music m JOIN donations d ON d.id=m.donation ORDER BY m.created DESC LIMIT 150').all(),alerts:db.prepare("SELECT COUNT(*) n FROM alerts WHERE status='queued'").get().n,voices:['iseke','raya'].filter(v=>existsSync(path.join(ROOT,'voices',`kk_KZ-${v}-x_low.onnx`)))};}
 function addDonation(v,test=false){
  const amount=num(v.amount,1,1000000);if(!Number.isInteger(amount))fail('Укажите целую сумму в тенге.');const name=str(v.name,50);if(!name)fail('Укажите имя.');const message=str(v.message,settings.messageLimit),video=youtubeId(str(v.youtube,400));
  if(video&&settings.blockedVideos.includes(video))fail('Это видео заблокировано ведущим.');if(video&&amount<settings.musicMinimum)fail(`Заказ музыки — от ${settings.musicMinimum} ₸.`);
  const id=randomUUID();db.prepare('INSERT INTO donations VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,name,amount,message,video,test?'confirmed':'pending',null,test?1:0,session,new Date().toISOString());
  if(test)enqueue(id,video);return {id,status:test?'test':'pending'};
 }
 function enqueue(id,video){db.prepare('INSERT INTO alerts VALUES(?,?,?,?)').run(randomUUID(),id,'queued',Date.now());if(video)db.prepare('INSERT INTO music VALUES(?,?,?,?,?,?)').run(randomUUID(),id,video,settings.autoApproveMusic?'approved':'pending','',Date.now())}
 const phone=createPhoneService({root:ROOT,db,read,save,bridgeFactory:phoneBridgeFactory,onDonation:(d,reference)=>{
  let video='';const link=d.message.match(/https:\/\/(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/)[^\s]+/)?.[0];
  if(link&&d.amount>=settings.musicMinimum){try{video=youtubeId(link)}catch{}if(settings.blockedVideos.includes(video))video=''}
  const id=randomUUID();db.prepare('INSERT INTO donations VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,str(d.name,50),d.amount,str(d.message,settings.messageLimit),video,'detected',reference,0,session,new Date().toISOString());
  if(!control.halted)enqueue(id,video);
 }});
 const rate=new Map();function throttle(bucket,limit=30){const now=Date.now();const a=(rate.get(bucket)||[]).filter(t=>now-t<60000);if(a.length>=limit)fail('Слишком много запросов. Подождите минуту.',429);a.push(now);rate.set(bucket,a)}
 function role(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');for(const k of ['admin','overlay'])if(token.length===keys[k].length&&timingSafeEqual(Buffer.from(token),Buffer.from(keys[k])))return k;return ''}
 async function body(req,max=1024*1024){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>max)fail('Файл или запрос слишком большой.',413);chunks.push(chunk)}return Buffer.concat(chunks)}
 const ttsJobs=new Map();let ttsChain=Promise.resolve();
 async function tts(text,voice,speed){
  if(!['iseke','raya'].includes(voice))fail('Выберите локальный голос.');let exe=path.join(ROOT,'runtime','piper','piper.exe'),model=path.join(ROOT,'voices',`kk_KZ-${voice}-x_low.onnx`);
  if(!existsSync(exe)||!existsSync(model))fail('Локальный голос не установлен. См. инструкцию.',503);
  const hash=createHash('sha256').update(JSON.stringify([text,voice,speed])).digest('hex'),out=path.join(dataDir,'audio',hash+'.wav');if(existsSync(out))return '/audio/'+hash+'.wav';
  if(!ttsJobs.has(hash)){const job=ttsChain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const p=spawn(exe,['--model',model,'--output_file',out,'--length_scale',String(1/speed)],{windowsHide:true,cwd:path.dirname(exe),stdio:['pipe','ignore','pipe']});let error='';p.stderr.on('data',c=>{error+=c.toString().slice(0,1000)});const timer=setTimeout(()=>{p.kill();reject(Error('Озвучка не успела подготовиться.'))},30000);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);code===0&&existsSync(out)?resolve():reject(Error('Ошибка Piper: '+error.slice(-250)))});p.stdin.on('error',()=>{});p.stdin.end(text+'\n','utf8')}));ttsChain=job;ttsJobs.set(hash,job.finally(()=>ttsJobs.delete(hash)))}
  await ttsJobs.get(hash);return '/audio/'+hash+'.wav';
 }
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
 const server=http.createServer(async(req,res)=>{
  const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v))};
  try{
   const host=req.headers.host;if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))fail('Недопустимый адрес сервера.',403);
   if(req.headers.origin&&!['http://'+host].includes(req.headers.origin))fail('Запрос из другого сайта отклонён.',403);
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Cache-Control','no-store');
   const url=new URL(req.url,'http://'+host),p=url.pathname,r=role(req),admin=r==='admin',player=admin||r==='overlay';
   if(p.startsWith('/api/')){
    if(req.method==='GET'&&p==='/api/public')return json({title:settings.title,paymentUrl:settings.paymentUrl,qr:settings.qr,goalName:settings.goalName,goalAmount:settings.goalAmount,total:total(),musicMinimum:settings.musicMinimum,messageLimit:settings.messageLimit});
    if(req.method==='POST'&&p==='/api/donations'){throttle('submit',12);return json(addDonation(JSON.parse(await body(req))),201)}
    if(!player)fail('Нужен ключ доступа ведущего.',401);
    if(req.method==='GET'&&p==='/api/state'){if(!admin)fail('Нет доступа.',403);let https=null;try{const h=JSON.parse(readFileSync(path.join(dataDir,'https-state.json')));if(Date.now()-h.updatedAt<15000&&h.status==='connected'&&/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(h.url))https={url:h.url,token:h.token}}catch{}return json({...state(),phone:phone.state(),overlayKey:keys.overlay,https})}
    if(req.method==='GET'&&p==='/api/widgets/state')return json(widgetState());
    if(req.method!=='POST')fail('Метод не поддерживается.',405);
    if(p==='/api/upload'){
     if(!admin)fail('Нет доступа.',403);let ext=String(req.headers['x-file-extension']||'').toLowerCase();if(!['png','jpg','jpeg','webp','gif','mp4','webm','mp3','wav','ogg'].includes(ext))fail('Поддерживаются PNG, JPG, WEBP, GIF, MP4, WEBM, MP3, WAV, OGG.');let content=await body(req,25*1024*1024);let name=randomUUID()+'.'+ext;writeFileSync(path.join(dataDir,'media',name),content);return json({url:'/media/'+name});
    }
    const v=JSON.parse((await body(req)).toString()||'{}');
    if(p==='/api/player/tick'){
     const client=str(v.client,80);if(!client)fail('Нет идентификатора окна.');
     const channels=v.mode==='alerts'?['alerts']:v.mode==='music'?['music']:['alerts','music'];
     if(channels.some(k=>leases[k].id&&leases[k].id!==client&&live(leases[k])))return json({busy:true});
     for(const kind of channels){const old=leases[kind];if(old.id&&(old.id!==client||!live(old)))db.exec(`UPDATE ${kind} SET status='interrupted' WHERE status='playing'`);leases[kind]={id:client,at:Date.now(),status:str(v.status,200)}}
     const duck=live(leases.alerts)&&!!db.prepare("SELECT id FROM alerts WHERE status='playing' LIMIT 1").get();
     return json({busy:false,settings,total:total(),control,duck});
    }
    if(p==='/api/player/claim'){
     const owner=leases[v.kind==='music'?'music':'alerts'];if(v.client!==owner.id||!live(owner))fail('Окно не владеет воспроизведением.',409);
     if(control.halted)return json({item:null});const table=v.kind==='music'?'music':'alerts',desired=table==='music'?'approved':'queued';
     if(table==='music'&&control.paused)return json({item:null});
     const item=transaction(()=>{if(db.prepare(`SELECT id FROM ${table} WHERE status='playing'`).get())return null;let row=db.prepare(`SELECT * FROM ${table} WHERE status=? ORDER BY created LIMIT 1`).get(desired);if(!row)return null;db.prepare(`UPDATE ${table} SET status='playing' WHERE id=?`).run(row.id);const d=db.prepare('SELECT * FROM donations WHERE id=?').get(row.donation);return {...row,donation:d}});return json({item});
    }
    if(p==='/api/player/finish'){
     const table=v.kind==='music'?'music':'alerts';if(v.client!==leases[table].id||!live(leases[table]))fail('Нет доступа к этому окну.',409);const status=v.error?'failed':'done';if(table==='music')db.prepare("UPDATE music SET status=?,note=? WHERE id=? AND status='playing'").run(status,str(v.error,200),str(v.id,80));else db.prepare("UPDATE alerts SET status=? WHERE id=? AND status='playing'").run(status,str(v.id,80));return json({ok:true});
    }
    if(p==='/api/tts'){throttle('tts',60);let text=str(v.text,600);if(!text)fail('Нет текста.');return json({url:await tts(text,v.voice,num(v.speed,.5,2))})}
    if(!admin)fail('Нет доступа к управлению.',403);
    if(p==='/api/phone'){try{return json((await phone.action(v))??{ok:true})}catch(e){fail(e.message,400)}}
    if(p==='/api/settings'){settings=validateSettings(v);save('settings',settings);return json({ok:true})}
    if(p==='/api/test')return json(transaction(()=>addDonation({...v,name:v.name||'Тестовый донат'},true)),201);
    if(p==='/api/confirm'){
     const reference=str(v.reference,100).replace(/\s+/g,' ').toUpperCase();if(reference.length<4)fail('Укажите номер операции или уникальную отметку из истории Kaspi (от 4 символов).');
     transaction(()=>{let d=db.prepare('SELECT * FROM donations WHERE id=?').get(v.id);if(!d||d.status!=='pending')fail('Эта заявка уже обработана.',409);if(db.prepare('SELECT id FROM donations WHERE reference=?').get(reference))fail('Этот платёж уже был подтверждён.',409);const amount=num(v.amount,1,1000000);if(amount!==d.amount)fail('Сумма должна совпадать с заявкой. Отклоните ошибочную заявку и создайте новую.');db.prepare("UPDATE donations SET status='confirmed',reference=?,session=? WHERE id=?").run(reference,session,d.id);enqueue(d.id,d.video)});return json({ok:true});
    }
    if(p==='/api/reject'){db.prepare("UPDATE donations SET status='rejected' WHERE id=? AND status='pending'").run(v.id);return json({ok:true})}
    if(p==='/api/music'){
     const m=db.prepare('SELECT * FROM music WHERE id=?').get(v.id);if(!m)fail('Заказ не найден.',404);
     if(v.action==='approve'){if(settings.blockedVideos.includes(m.video))fail('Видео заблокировано.');db.prepare("UPDATE music SET status='approved',note='' WHERE id=? AND status='pending'").run(m.id)}
     else if(['remove','block'].includes(v.action)){if(m.status==='playing')control.skipMusic++;db.prepare("UPDATE music SET status='removed' WHERE id=?").run(m.id);if(v.action==='block'){settings.blockedVideos=[...new Set([...settings.blockedVideos,m.video])];save('settings',settings);db.prepare("UPDATE music SET status='removed',note='Видео заблокировано' WHERE video=? AND status IN ('pending','approved')").run(m.video)}}else fail('Неизвестное действие.');return json({ok:true});
    }
    if(p==='/api/control'){
     if(v.action==='stop'){control.stop++;control.halted=true;control.paused=true;db.exec("UPDATE alerts SET status='stopped' WHERE status IN ('queued','playing'); UPDATE music SET status='stopped' WHERE status IN ('approved','playing','pending')")}
     else if(v.action==='resume'){control.halted=false;control.paused=false;db.exec("UPDATE alerts SET status='interrupted' WHERE status='playing'; UPDATE music SET status='interrupted' WHERE status='playing'")}
     else if(v.action==='pause')control.paused=true;
     else if(v.action==='play'){control.halted=false;control.paused=false}
     else if(v.action==='skipTts')control.skipTts++;
     else if(v.action==='skipMusic'){control.skipMusic++;db.exec("UPDATE music SET status='skipped' WHERE status='playing'")}
     else if(v.action==='mute'){settings.ttsEnabled=false;save('settings',settings);control.skipTts++}
     else if(v.action==='newSession'){session=randomUUID();save('session',session)}else fail('Неизвестная команда.');return json({ok:true});
    }
    fail('Маршрут не найден.',404);
   }
   if(req.method!=='GET'&&req.method!=='HEAD')fail('Метод не поддерживается.',405);
   let file;if(/^\/media\/[\w-]+\.[a-z0-9]+$/.test(p))file=path.join(dataDir,p.slice(1));else if(/^\/audio\/[a-f0-9]{64}\.wav$/.test(p))file=path.join(dataDir,p.slice(1));else if(/^\/samples\/[a-z]+\.wav$/.test(p))file=path.join(ROOT,p.slice(1));else {const pages={'/':'admin.html','/donate':'donate.html','/overlay':'overlay.html','/widget':'widget.html'};const name=pages[p]||p.slice(1);if(!/^[\w.-]+\.(html|js|css)$/.test(name))fail('Страница не найдена.',404);file=path.join(ROOT,'public',name)}
   if(!existsSync(file))fail('Файл не найден.',404);const size=statSync(file).size;const mime=types[path.extname(file)]||'application/octet-stream';const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){let start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1;if(start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()};res.writeHead(206,{'Content-Type':mime,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes'});return createReadStream(file,{start,end}).pipe(res)}
   res.writeHead(200,{'Content-Type':mime,'Content-Length':size,'Accept-Ranges':'bytes'});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)json({error:e.status?e.message:'Ошибка приложения. '+e.message},e.status||500);else res.end()}
 });
 return {server,db,keys,settings,listen:()=>new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server))),close:()=>{
  phone.close();return new Promise(resolve=>server.close(()=>{db.close();resolve()}));
 }};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const app=createApp();app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Приложение уже запущено: http://127.0.0.1:3877':e.message);process.exitCode=1});await app.listen();console.log('Qoldau Live: http://127.0.0.1:'+Number(process.env.PORT||3877));}
