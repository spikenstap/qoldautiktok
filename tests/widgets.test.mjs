import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
test('separate widgets isolate audio ownership, share ducking and expose only aggregate real totals',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'qoldau-widgets-')),app=createApp({dataDir:dir,port:3989});await app.listen();
 const call=async(p,v,key=app.keys.overlay)=>{const r=await fetch('http://127.0.0.1:3989/api/'+p,{method:v===undefined?'GET':'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Connection:'close'},body:v===undefined?undefined:JSON.stringify(v)});return {status:r.status,data:await r.json()}};
 try{
  assert.equal((await call('widgets/state',undefined,'')).status,401);
  await call('test',{amount:500,name:'Тестовый лидер',youtube:'https://youtu.be/M7lc1UVf-VE'},app.keys.admin);
  assert.deepEqual((await call('widgets/state')).data.top,[]);
  assert.equal((await call('player/tick',{client:'alert',mode:'alerts'})).data.busy,false);
  assert.equal((await call('player/tick',{client:'music',mode:'music'})).data.busy,false);
  assert.equal((await call('player/tick',{client:'duplicate',mode:'alerts'})).data.busy,true);
  assert.equal((await call('player/tick',{client:'combined'})).data.busy,true);
  assert.equal((await call('player/claim',{client:'music',kind:'alerts'})).status,409);
  assert.equal((await call('player/claim',{client:'alert',kind:'music'})).status,409);
  const item=(await call('player/claim',{client:'alert',kind:'alerts'})).data.item;assert.ok(item);
  assert.equal((await call('player/tick',{client:'music',mode:'music'})).data.duck,true);
  const state=(await call('state',undefined,app.keys.admin)).data;
  await call('music',{id:state.music[0].id,action:'approve'},app.keys.admin);
  const track=(await call('player/claim',{client:'music',kind:'music'})).data.item;
  assert.ok(track);assert.equal(track.video,'M7lc1UVf-VE');
  assert.equal((await call('player/finish',{client:'alert',kind:'music',id:track.id})).status,409);
  assert.equal((await call('player/finish',{client:'music',kind:'alerts',id:item.id})).status,409);
  await call('player/finish',{client:'alert',kind:'alerts',id:item.id});
  assert.equal((await call('player/tick',{client:'music',mode:'music'})).data.duck,false);
  assert.equal((await call('player/finish',{client:'music',kind:'music',id:track.id})).status,200);
  for(const [name,amount,ref] of [['Әлия',700,'W-001'],['Әлия',300,'W-002'],['Нұрлан',1200,'W-003']]){
   const donation=(await call('donations',{name,amount,message:'Private message'},'')).data;
   await call('confirm',{id:donation.id,amount,reference:ref},app.keys.admin);
  }
  const stats=(await call('widgets/state')).data;assert.equal(stats.total,2200);assert.deepEqual(stats.top,[{name:'Нұрлан',amount:1200},{name:'Әлия',amount:1000}]);assert.equal(stats.phone,undefined);assert.equal(stats.donations,undefined);assert.equal(stats.settings,undefined);
  for(let i=1;i<=9;i++){
   const submitted=await call('donations',{name:'Rank '+i,amount:i*200,message:''},'');assert.equal(submitted.status,201);const d=submitted.data;
   assert.equal((await call('confirm',{id:d.id,amount:i*200,reference:'TOP10-'+i},app.keys.admin)).status,200);
  }
  const leaders=(await call('widgets/state')).data.top;
  assert.equal(leaders.length,10);
  assert.deepEqual(leaders.slice(0,3).map(d=>d.amount),[1800,1600,1400]);
  assert.equal(leaders.at(-1).amount,400);
  assert.ok(!leaders.some(d=>d.name==='Rank 1'||d.name==='Тестовый лидер'));
  assert.equal((await call('settings',{},app.keys.overlay)).status,403);
  await call('control',{action:'newSession'},app.keys.admin);assert.deepEqual((await call('widgets/state')).data.top,[]);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
