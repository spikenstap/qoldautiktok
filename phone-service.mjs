import {createHash} from 'node:crypto';
import {createPhoneBridge,compileTemplate,parseNotification} from './phone.mjs';

const clean=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createPhoneService({root,db,read,save,onDonation,bridgeFactory=createPhoneBridge}){
 const config={deviceId:'',deviceName:'',enabled:false,templates:[],...read('phone',{})};
 let latest=read('phoneLatest',null),outcome='Подключи свой iPhone, чтобы получить пример уведомления.';
 db.exec('CREATE TABLE IF NOT EXISTS phone_seen(id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE,received TEXT NOT NULL,result TEXT NOT NULL)');
 const match=text=>config.templates.map(t=>parseNotification(t,text)).find(Boolean)||null;
 function receive(event){
  if(event.app!=='kz.kaspi.mobile'||!config.deviceId||event.device!==config.deviceId)return;
  const text=[event.title,event.subtitle,event.message].map(clean).filter(Boolean).join(' ').slice(0,3500);
  if(!text)return;
  const dated=/^\d{8}T\d{6}$/.test(String(event.date||''));
  const id=digest(JSON.stringify([event.device,event.date,event.uid]));
  const fingerprint=digest(JSON.stringify([event.device,event.app,event.date,text]));
  if(db.prepare('SELECT id FROM phone_seen WHERE id=? OR fingerprint=?').get(id,fingerprint)){outcome='Повторное уведомление пропущено.';return}
  const sample={id,text,date:clean(event.date),received:new Date().toISOString(),dated};
  const donation=config.enabled&&dated?match(text):null;
  db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare('INSERT INTO phone_seen VALUES(?,?,?,?)').run(id,fingerprint,sample.received,donation?'detected':'observed');
   if(donation)onDonation(donation,'IPHONE:'+id);
   save('phoneLatest',sample);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  latest=sample;
  outcome=donation?'Входящий перевод распознан и записан в историю.':!dated?'Нет даты уведомления: автоматический показ пропущен.':config.enabled?'Текст не совпал с настроенными входящими переводами. В эфир не отправлен.':'Пример получен. Настрой распознавание входящего перевода ниже.';
 }
 const bridge=bridgeFactory({root,config,onNotification:receive});
 function preview(templates){
  if(!Array.isArray(templates)||!templates.length||templates.length>4)throw Error('Нужно от 1 до 4 шаблонов, каждый с новой строки.');
  templates.forEach(compileTemplate);
  if(!latest)throw Error('Сначала дождись нового уведомления Kaspi с телефона.');
  const parsed=templates.map(t=>parseNotification(t,latest.text)).find(Boolean);
  if(!parsed)throw Error('Шаблон не совпал с последним уведомлением. Сохрани все слова и знаки между полями.');
  return parsed;
 }
 return {
  state:()=>({...bridge.state(),latest,outcome}),
  action:async v=>{
   if(v.action==='scan')return bridge.scan();
   if(v.action==='enable')return bridge.enable();
   if(v.action==='pair')return bridge.pair(String(v.id||''));
   if(v.action==='connect'){
    const changed=config.deviceId!==v.id;
    const result=await bridge.connect(String(v.id||''));
    if(changed){config.enabled=false;config.templates=[];latest=null;save('phoneLatest',null)}
    save('phone',config);return result;
   }
   if(v.action==='cancel'){bridge.cancel();return {ok:true}}
   if(v.action==='disconnect'){bridge.disconnect();return {ok:true}}
   if(v.action==='disable'){config.enabled=false;save('phone',config);return {ok:true}}
   if(v.action==='preview')return {parsed:preview(v.templates),sampleId:latest.id};
   if(v.action==='save'){
    const parsed=preview(v.templates);
    if(!latest.dated)throw Error('Для автоматического показа нужна дата уведомления iPhone.');
    if(v.sampleId!==latest.id||v.verified!==true)throw Error('Проверь пример: это входящий перевод, сумма, имя и сообщение распознаны правильно.');
    config.templates=v.templates.map(clean);config.enabled=true;save('phone',config);
    outcome='Автоматический показ включён для новых уведомлений. Проверочный пример повторно не выводится.';
    return {ok:true,parsed};
   }
   throw Error('Неизвестная команда телефона.');
  },
  close:()=>bridge.close(),
 };
}
