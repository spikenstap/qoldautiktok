import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {createWidgetGateway} from '../widget-gateway.mjs';

test('HTTPS gateway serves authenticated widgets, strips banking metadata and blocks all administration',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'qoldau-gateway-')),app=createApp({dataDir:dir,port:3992});await app.listen();
 const token='a'.repeat(64),gateway=createWidgetGateway({upstream:'http://127.0.0.1:3992',overlayKey:app.keys.overlay,token,port:3993});await gateway.listen();
 const request=(p,{method='GET',body,headers={}}={})=>fetch('http://127.0.0.1:3993'+p,{method,body:body&&JSON.stringify(body),headers:{Connection:'close',...headers}});
 const auth={Authorization:'Bearer '+token};
 try{
  assert.equal((await request('/widget?type=top')).status,401);
  const page=await request('/widget?type=top&token='+token);assert.equal(page.status,200);assert.match(page.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.match(await page.text(),/widget-render/);
  assert.equal((await request('/widget.js',{headers:{Cookie:'qoldau_widget='+token}})).status,200);
  assert.equal((await request('/widget.js',{headers:{Cookie:'qoldau_widget=bad'}})).status,401);
  for(const p of ['/','/admin.html','/admin.js','/donate','/api/state','/api/phone','/api/settings','/api/test','/api/control','/data/keys.json','/api/public']){
   assert.equal((await request(p,{headers:auth})).status,404,p);
   assert.equal((await request(p,{method:'POST',body:{},headers:auth})).status,404,p);
  }
  assert.equal((await request('/api/widgets/state',{headers:{Authorization:'Bearer '+app.keys.admin}})).status,401);
  assert.equal((await request('/api/widgets/state',{headers:{...auth,Origin:'https://other.example'}})).status,403);
  const stats=await (await request('/api/widgets/state',{headers:auth})).json();assert.deepEqual(stats.top,[]);assert.equal(stats.phone,undefined);
  const tick=await (await request('/api/player/tick',{method:'POST',headers:auth,body:{client:'gateway',mode:'alerts'}})).json();assert.equal(tick.busy,false);assert.equal(tick.settings.paymentUrl,undefined);assert.equal(tick.settings.qr,undefined);assert.ok(tick.settings.ranges);
  await fetch('http://127.0.0.1:3992/api/test',{method:'POST',headers:{Authorization:'Bearer '+app.keys.admin,'Content-Type':'application/json'},body:JSON.stringify({name:'Тест',amount:1500,message:'Ә ғ қ ң ө ұ ү һ і'})});
  const claim=await (await request('/api/player/claim',{method:'POST',headers:auth,body:{client:'gateway',kind:'alerts'}})).json();assert.equal(claim.item.donation.message,'Ә ғ қ ң ө ұ ү һ і');assert.deepEqual(Object.keys(claim.item.donation).sort(),['amount','message','name','test']);
  assert.equal((await request('/api/player/finish',{method:'POST',headers:auth,body:{client:'gateway',kind:'alerts',id:claim.item.id}})).status,200);
  writeFileSync(path.join(dir,'audio','b'.repeat(64)+'.wav'),'audio');
  assert.equal((await request('/audio/'+'b'.repeat(64)+'.wav')).status,401);
  assert.equal(await (await request('/audio/'+'b'.repeat(64)+'.wav',{headers:{Cookie:'qoldau_widget='+token}})).text(),'audio');
  assert.equal((await request('/api/tts',{method:'POST',headers:auth,body:{text:'x'.repeat(9000)}})).status,413);
 }finally{await gateway.close();await app.close();rmSync(dir,{recursive:true,force:true})}
});
