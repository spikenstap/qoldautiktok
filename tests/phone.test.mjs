import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {compileTemplate,parseNotification} from '../phone.mjs';
import {createApp} from '../server.mjs';

// Synthetic examples exercise parsing; they do not claim to be Kaspi's actual format.
const template='Kaspi Пополнение: {amount} ₸ От: {name} Сообщение: {message}';
test('literal template handles Kazakh, rejects expenses and non-integer amounts',()=>{
 assert.deepEqual(parseNotification(template,'Kaspi Пополнение: 1\u00a0000,00 ₸ От: Әлия Сообщение: Ғажап ән!'),{amount:1000,name:'Әлия',message:'Ғажап ән!'});
 assert.equal(parseNotification(template,'Kaspi Списание: 1 000 ₸ От: Әлия Сообщение: Ғажап ән!'),null);
 assert.equal(parseNotification(template,'Kaspi Пополнение: 100,50 ₸ От: Әлия Сообщение: Ғажап ән!'),null);
 assert.throws(()=>compileTemplate('{amount} {message}'));
 assert.throws(()=>compileTemplate('Пополнение {amount} {amount}'));
 assert.throws(()=>compileTemplate('Пополнение {amount} {unknown}'));
 assert.equal(parseNotification('Перевод [входящий]+: {amount} ₸','Перевод [входящий]+: 100 ₸').amount,100);
});

test('trusted iPhone notifications require calibration, deduplicate durably and use the playback queue',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'qoldau-phone-'));let notify;
 const factory=({config,onNotification})=>{notify=onNotification;return {
  state:()=>({config,devices:[],radios:[],status:'test',connected:true}),
  connect:async id=>{config.deviceId=id;config.deviceName='Test iPhone'},
  close(){},cancel(){},disconnect(){},
 }};
 let app=createApp({dataDir:dir,port:3988,phoneBridgeFactory:factory});await app.listen();
 const call=async(p,data,key=app.keys.admin)=>{const r=await fetch('http://127.0.0.1:3988/api/'+p,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Connection:'close',Authorization:'Bearer '+key},body:data===undefined?undefined:JSON.stringify(data)});return {code:r.status,body:await r.json()}};
 const event={app:'kz.kaspi.mobile',device:'own-phone',uid:1,date:'20261121T120000',title:'Kaspi',subtitle:'',message:'Пополнение: 1 000 ₸ От: Әлия Сообщение: Ғажап ән!'};
 try{
  assert.equal((await call('phone',{action:'connect',id:'own-phone'},app.keys.overlay)).code,403);
  assert.equal((await call('phone',{action:'save',templates:[template],verified:true})).code,400);
  await call('phone',{action:'connect',id:'own-phone'});notify(event);
  let state=(await call('state')).body;assert.equal(state.total,0);assert.equal(state.alerts,0);assert.ok(state.phone.latest);
  const preview=(await call('phone',{action:'preview',templates:[template]})).body;
  assert.equal(preview.parsed.amount,1000);
  assert.equal((await call('phone',{action:'save',templates:[template],sampleId:'wrong',verified:true})).code,400);
  assert.equal((await call('phone',{action:'save',templates:[template],sampleId:preview.sampleId,verified:true})).code,200);
  notify(event);assert.equal((await call('state')).body.total,0); // calibration never replays
  notify({...event,uid:2,date:'20261121T120001'});
  notify({...event,uid:2,date:'20261121T120001',message:event.message+' changed'}); // same native identity
  notify({...event,uid:22,date:'20261121T120001'}); // duplicate content, different native UID
  notify({...event,uid:3,date:'20261121T120002',app:'other.app'});
  notify({...event,uid:3,date:'20261121T120002',device:'other-phone'});
  notify({...event,uid:3,date:'20261121T120002',message:event.message.replace('Пополнение','Списание')});
  notify({...event,uid:4,date:''});
  state=(await call('state')).body;assert.equal(state.total,1000);assert.equal(state.alerts,1);assert.equal(state.donations[0].status,'detected');
  notify({...event,uid:5,date:'20261121T120005',message:'Пополнение: 1 000 ₸ От: Әлия Сообщение: https://youtu.be/M7lc1UVf-VE'});
  state=(await call('state')).body;assert.equal(state.music.length,1);assert.equal(state.music[0].status,'pending');
  await call('player/tick',{client:'test-player'},app.keys.overlay);
  const claim=(await call('player/claim',{client:'test-player',kind:'alerts'},app.keys.overlay)).body;
  assert.equal(claim.item.donation.name,'Әлия');assert.equal(claim.item.donation.amount,1000);
  await call('control',{action:'stop'});notify({...event,uid:6,date:'20261121T120006'});
  state=(await call('state')).body;assert.equal(state.total,3000);assert.equal(state.alerts,0); // halted alerts never backlog
  await app.close();app=createApp({dataDir:dir,port:3988,phoneBridgeFactory:factory});await app.listen();
  notify({...event,uid:2,date:'20261121T120001'});assert.equal((await call('state')).body.total,3000);
  await call('phone',{action:'disable'});notify({...event,uid:7,date:'20261121T120007'});assert.equal((await call('state')).body.total,3000);
  const pub=(await call('public',undefined,'')).body;assert.equal(pub.phone,undefined);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
