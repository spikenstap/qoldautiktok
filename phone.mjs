import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

const normalize=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
export function compileTemplate(template){
 const text=normalize(template);if(!text||text.length>1400)throw Error('Вставь шаблон уведомления о входящем переводе (до 1400 символов).');
 const names=[...text.matchAll(/\{([^{}]+)\}/g)].map(x=>x[1]);
 if(names.filter(x=>x==='amount').length!==1||names.some(x=>!['amount','name','balance','message'].includes(x))||new Set(names).size!==names.length)throw Error('Нужен один {amount}. Допустимы также {name}, {balance}, {message}, каждый один раз.');
 let pattern='',last=0;for(const m of text.matchAll(/\{(amount|name|balance|message)\}/g)){pattern+=text.slice(last,m.index).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');pattern+=['amount','balance'].includes(m[1])?`(?<${m[1]}>[0-9][0-9 .,]{0,22})`:`(?<${m[1]}>.{1,300}?)`;last=m.index+m[0].length}
 if(text.replace(/\{[^{}]+\}/g,'').replace(/\s/g,'').length<8)throw Error('Сохрани слова из уведомления, которые обозначают входящий перевод. Одних полей недостаточно.');
 pattern+=text.slice(last).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('^'+pattern+'$','u');
}
export function parseNotification(template,text){
 let match=compileTemplate(template).exec(normalize(text));if(!match)return null;
 const value=match.groups.amount.replace(/ /g,'').replace(',','.');if(!/^\d+(?:\.0{1,2})?$/.test(value))return null;const amount=Number(value);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)return null;
 return {amount,name:normalize(match.groups.name)||'Зритель',message:normalize(match.groups.message)};
}

export function createPhoneBridge({root,onNotification,config}){
 let devices=[],radios=[],status='Не подключён',connected=false,worker=null,task=null;
 const executable=path.join(root,'runtime','iphone-bridge','iphone-bridge.exe');
 function run(command,{stream=false}={}){return new Promise((resolve,reject)=>{
  if(!existsSync(executable))return reject(Error('Модуль Bluetooth ещё не собран.'));
  const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});if(stream)worker=child;else task=child;
  let rest='',result={},settled=false,errors='';const timeout=stream?null:setTimeout(()=>{child.kill();reject(Error('Истекло время ожидания Windows. Повтори поиск или сопряжение.'))},command.action==='pair'?100000:45000);
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{if(child!==worker&&child!==task)return;rest+=chunk;if(rest.length>100000){status='Некорректный ответ модуля Bluetooth';child.kill();return}let pos;while((pos=rest.indexOf('\n'))>=0){const line=rest.slice(0,pos);rest=rest.slice(pos+1);let e;try{e=JSON.parse(line)}catch{continue}if(e.type==='devices'){devices=e.devices;radios=e.radios;status=`Найдено устройств: ${devices.length}`;result=e}else if(e.type==='radios'){radios=e.radios;result=e;status=radios.some(r=>r.on)?'Bluetooth включён':'Bluetooth выключен'}else if(e.type==='connected'){connected=true;status='iPhone подключён. Ожидание нового уведомления Kaspi.'}else if(e.type==='notification'){try{onNotification({...e,device:command.id})}catch(err){status='Ошибка обработки уведомления: '+err.message}}else if(e.type==='paired'){status='Сопряжение выполнено. Обнови список и выбери iPhone с пометкой «Уведомления». Разреши системные уведомления на телефоне.';result=e}else if(e.type==='status'||e.type==='error'){status=e.message;if(e.connected===false||e.type==='error')connected=false;if(e.type==='error')errors=e.message}}});
  child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-1500)});child.on('error',e=>{clearTimeout(timeout);settled=true;status='Не удалось запустить Bluetooth: '+e.message;connected=false;if(worker===child)worker=null;if(task===child)task=null;reject(e)});
  child.on('close',code=>{clearTimeout(timeout);if(worker===child){worker=null;connected=false;if(code&&errors)status=errors.slice(-600)}if(task===child)task=null;if(settled)return;if(code&&errors){status=errors.slice(-600);reject(Error(status))}else resolve(result)});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...command,parentPid:process.pid})+'\n');
  if(stream){settled=true;resolve({ok:true})}
 })}
 return {
  state:()=>({config,devices,radios,status,connected,busy:!!task,running:!!worker,installed:existsSync(executable)}),
  scan:async()=>{if(task)throw Error('Дождись завершения текущего действия.');status='Поиск устройств… Открой Настройки → Bluetooth на iPhone.';return run({action:'scan'})},
  enable:async()=>{if(task)throw Error('Дождись завершения текущего действия.');status='Запрашиваю включение Bluetooth…';return run({action:'enable'})},
  pair:async id=>{if(task)throw Error('Дождись завершения текущего действия.');let d=devices.find(x=>x.id===id&&!x.listen);if(!d)throw Error('Сначала найди и выбери свой телефон.');status='Отправляю запрос выбранному телефону…';return run({action:'pair',id:d.id})},
  connect:async id=>{if(task)throw Error('Дождись завершения текущего действия.');let d=devices.find(x=>x.id===id&&x.listen);if(!d)throw Error('Обнови список и выбери сопряжённый iPhone с пометкой «Уведомления».');if(worker)worker.kill();connected=false;config.deviceId=d.id;config.deviceName=d.name;status='Подключение к уведомлениям iPhone…';return run({action:'listen',id:d.id},{stream:true})},
  disconnect:()=>{worker?.kill();worker=null;connected=false;status='Отключено'},
  cancel:()=>{const pending=task;task=null;pending?.kill();worker?.kill();worker=null;connected=false;status='Действия отменены. Телефон отключён.'},
  close:()=>{worker?.kill();task?.kill()},
 };
}
