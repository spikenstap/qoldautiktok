import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';

// Only stream widgets cross this boundary. Never forward an arbitrary URL or headers.
const assets=new Set(['/overlay','/widget','/style.css','/neon.css','/overlay.css','/overlay.js','/widget.js','/widget-render.js']);
const postRoutes=new Set(['/api/player/tick','/api/player/claim','/api/player/finish','/api/tts']);
const settingsFields=['goalName','goalAmount','showGoal','ranges','ttsEnabled','voice','ttsRate','ttsVolume','messageLimit','musicVolume','musicMaxSeconds'];
const pick=(value,fields)=>Object.fromEntries(fields.filter(k=>k in value).map(k=>[k,value[k]]));
export function createWidgetGateway({upstream,overlayKey,token,port=3880}){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid gateway token');
 const valid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&timingSafeEqual(Buffer.from(value),Buffer.from(token));
 const server=http.createServer(async(req,res)=>{
  const send=(code,message)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:message}))};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  try{
   const url=new URL(req.url,'http://widget.invalid'),p=url.pathname;
   const page=['/overlay','/widget'].includes(p),get=['GET','HEAD'].includes(req.method);
   const media=/^\/(media\/[a-f0-9-]+\.(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg)|audio\/[a-f0-9]{64}\.wav)$/.test(p);
   if(!(get&&(assets.has(p)||media||p==='/api/widgets/state'))&&!(req.method==='POST'&&postRoutes.has(p)))return send(404,'Этот адрес не является виджетом.');
   const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('qoldau_widget='))?.slice(14);
   const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(!valid(bearer)&&!valid(cookie)&&!(page&&valid(url.searchParams.get('token'))))return send(401,'Скопируй полную HTTPS-ссылку из панели ведущего.');
   if(req.headers.origin&&req.headers.origin!==`https://${req.headers.host}`&&req.headers.origin!==`http://${req.headers.host}`)return send(403,'Другой источник запроса.');
   if(page&&valid(url.searchParams.get('token')))res.setHeader('Set-Cookie',`qoldau_widget=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`);
   const target=new URL(p,upstream);for(const k of ['type','widget','transparent','embed'])if(url.searchParams.has(k))target.searchParams.set(k,url.searchParams.get(k));
   let body;if(req.method==='POST'){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>8192)return send(413,'Слишком большой запрос.');chunks.push(c)}body=Buffer.concat(chunks)}
   const headers={Authorization:'Bearer '+overlayKey};if(body)headers['Content-Type']='application/json';if(req.headers.range)headers.Range=req.headers.range;
   const response=await fetch(target,{method:req.method,headers,body,redirect:'error',signal:AbortSignal.timeout(45000)});
   for(const name of ['Content-Type','Content-Range','Accept-Ranges'])if(response.headers.has(name))res.setHeader(name,response.headers.get(name));
   if(p.startsWith('/api/')){
    const data=await response.json();
    if(data.settings)data.settings=pick(data.settings,settingsFields);
    if(data.item?.donation)data.item.donation=pick(data.item.donation,['name','amount','message','test']);
    res.writeHead(response.status);return res.end(JSON.stringify(data));
   }
   if(response.headers.has('Content-Length'))res.setHeader('Content-Length',response.headers.get('Content-Length'));
   res.writeHead(response.status);if(req.method==='HEAD'||!response.body)return res.end();Readable.fromWeb(response.body).pipe(res);
  }catch{if(!res.headersSent)send(502,'Приложение донатов недоступно. Запусти START-HTTPS.cmd на компьютере ведущего.');else res.end()}
 });
 return {server,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server.address()))}),close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})};
}
