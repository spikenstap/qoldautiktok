import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp,youtubeId,kkNumber} from '../server.mjs';
test('YouTube parser accepts only exact supported HTTPS hosts',()=>{assert.equal(youtubeId('https://youtu.be/M7lc1UVf-VE'),'M7lc1UVf-VE');assert.equal(youtubeId('https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1'),'M7lc1UVf-VE');for(const x of ['https://youtube.com.attacker.test/watch?v=M7lc1UVf-VE','http://youtube.com/watch?v=M7lc1UVf-VE','javascript:alert(1)','https://youtube.com@attacker.test/watch?v=M7lc1UVf-VE'])assert.throws(()=>youtubeId(x))});
test('Kazakh monetary numbers preserve spelling',()=>{assert.equal(kkNumber(777),'жеті жүз жетпіс жеті');assert.equal(kkNumber(1000),'мың');assert.equal(kkNumber(12500),'он екі мың бес жүз');assert.equal(kkNumber(1000000),'бір миллион')});
test('payment authorization, idempotence, queue ownership and stop survive real HTTP flow',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'qoldau-test-'));const port=3987;const app=createApp({dataDir:dir,port});await app.listen();
 const call=async(p,data,key=app.keys.admin,headers={})=>{const r=await fetch(`http://127.0.0.1:${port}/api/${p}`,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Connection:'close',Authorization:'Bearer '+key,...headers},body:data===undefined?undefined:JSON.stringify(data)});return {code:r.status,body:await r.json()}};
 try{
  assert.equal((await call('state',undefined,'')).code,401);assert.equal((await call('state',undefined,app.keys.overlay)).code,403);
  assert.equal((await call('test',{amount:100,name:'X'},app.keys.admin,{Origin:'https://evil.example'})).code,403);
  const d=await call('donations',{name:'Әлия',amount:777,message:'Ә Ғ Қ Ң Ө Ұ Ү Һ І',youtube:'https://youtu.be/M7lc1UVf-VE'},'');assert.equal(d.code,201);
  let st=(await call('state')).body;assert.equal(st.total,0);assert.equal(st.alerts,0);assert.equal(st.music.length,0);
  assert.equal((await call('confirm',{id:d.body.id,reference:'TXN-001',amount:777},app.keys.overlay)).code,403);
  assert.equal((await call('confirm',{id:d.body.id,reference:'TXN-001',amount:778})).code,400);
  const approvals=await Promise.all([call('confirm',{id:d.body.id,reference:'TXN-001',amount:777}),call('confirm',{id:d.body.id,reference:'TXN-001',amount:777})]);assert.deepEqual(approvals.map(x=>x.code).sort(),[200,409]);
  st=(await call('state')).body;assert.equal(st.total,777);assert.equal(st.alerts,1);assert.equal(st.music[0].status,'pending');
  const d2=await call('donations',{name:'Repeat',amount:777},'');assert.equal((await call('confirm',{id:d2.body.id,reference:'  txn-001  ',amount:777})).code,409);
  await call('player/tick',{client:'one'},app.keys.overlay);assert.equal((await call('player/tick',{client:'two'},app.keys.overlay)).body.busy,true);
  assert.equal((await call('player/claim',{client:'two',kind:'alerts'},app.keys.overlay)).code,409);
  assert.equal((await call('player/claim',{client:'one',kind:'music'},app.keys.overlay)).body.item,null);
  const claims=await Promise.all([call('player/claim',{client:'one',kind:'alerts'},app.keys.overlay),call('player/claim',{client:'one',kind:'alerts'},app.keys.overlay)]);assert.equal(claims.filter(x=>x.body.item).length,1);assert.equal(claims.find(x=>x.body.item).body.item.donation.message,'Ә Ғ Қ Ң Ө Ұ Ү Һ І');
  await call('music',{id:st.music[0].id,action:'approve'});assert.ok((await call('player/claim',{client:'one',kind:'music'},app.keys.overlay)).body.item);
  await call('test',{amount:5000,message:'test'});assert.equal((await call('state')).body.total,777);
  await call('control',{action:'stop'});st=(await call('state')).body;assert.equal(st.alerts,0);assert.equal(st.control.halted,true);assert.equal((await call('player/claim',{client:'one',kind:'alerts'},app.keys.overlay)).body.item,null);
  assert.equal((await call('settings',{...st.settings,paymentUrl:'https://evil.example'})).code,400);assert.equal((await call('settings',{...st.settings,ranges:[{...st.settings.ranges[0],min:500,max:100}]})).code,400);
  await call('control',{action:'newSession'});assert.equal((await call('state')).body.total,0);
  const bad=await fetch(`http://127.0.0.1:${port}/server.mjs`);assert.equal(bad.status,404);
  await call('control',{action:'resume'});await call('test',{amount:100,message:'Started before restart'});await call('test',{amount:200,message:'Queued before restart'});assert.ok((await call('player/claim',{client:'one',kind:'alerts'},app.keys.overlay)).body.item);
 }finally{await app.close()}
 const restart=createApp({dataDir:dir,port});await restart.listen();try{const r=await fetch(`http://127.0.0.1:${port}/api/state`,{headers:{Authorization:'Bearer '+restart.keys.admin}});const data=await r.json();assert.equal(data.donations.filter(d=>d.reference==='TXN-001').length,1);assert.equal(restart.keys.admin,app.keys.admin);assert.equal(data.alerts,1);assert.equal(restart.db.prepare("SELECT COUNT(*) n FROM alerts WHERE status='playing'").get().n,0);assert.equal(restart.db.prepare("SELECT COUNT(*) n FROM alerts WHERE status='interrupted'").get().n,1)}finally{await restart.close();rmSync(dir,{recursive:true,force:true})}
});
