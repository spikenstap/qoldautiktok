let phoneLoaded=false,phonePreviewId='',phonePreviewTemplates='';
const phoneTemplates=()=>$('#phoneTemplates').value.split('\n').map(x=>x.trim()).filter(Boolean);
function invalidatePhonePreview(){phonePreviewId='';$('#phoneSave').disabled=true;$('#phoneVerified').checked=false;$('#phoneParsed').textContent='Проверь распознавание перед включением.'}
window.renderPhone=()=>{
 const p=state.phone;if(!p)return;
 $('#phoneStatus').textContent=p.status;$('#phoneStatus').classList.toggle('connected',p.connected);
 $('#phoneRadio').textContent=p.radios.map(r=>r.name+': '+(r.on?'включён':'выключен')).join(' · ');
 const devices=[...p.devices].sort((a,b)=>Number(/iphone/i.test(b.name))-Number(/iphone/i.test(a.name)));
 const html=devices.map(d=>`<div class="row"><div class="row-head"><div><strong>${esc(d.name)}</strong><br><small>${d.listen?(/iphone/i.test(d.name)?'Уведомления · сопряжён':'Bluetooth LE · сопряжён'):d.paired?'Сопряжён · обнови поиск для уведомлений':'Доступен для сопряжения'}</small></div><button ${p.busy?'disabled':''} data-phone="${d.listen?'connect':'pair'}" data-device="${esc(d.id)}">${d.listen?'Подключить':'Сопрячь'}</button></div>`).join('');
 if($('#phoneDevices').innerHTML!==html)$('#phoneDevices').innerHTML=html;
 for(const b of $$('[data-phone="scan"],[data-phone="enable"]'))b.disabled=p.busy;
 $('#phoneOutcome').textContent=p.outcome;
 $('#phoneSample').textContent=p.latest?.text||'Пока уведомлений нет.';
 $('#phoneSampleTime').textContent=p.latest?'Получено: '+new Date(p.latest.received).toLocaleString('ru-RU'):'';
 $('#phoneMode').textContent=p.config.enabled?'Автопоказ включён. В эфир попадут новые уведомления, совпавшие с шаблоном.':'Автопоказ выключен. Уведомления доступны только в этой панели.';
 if(!phoneLoaded){$('#phoneTemplates').value=p.config.templates.join('\n');phoneLoaded=true}
 if(phonePreviewId&&p.latest?.id!==phonePreviewId)invalidatePhonePreview();
};
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-phone]');if(!b)return;
 try{const result=await api('phone',{action:b.dataset.phone,id:b.dataset.device});await refresh();if(b.dataset.phone==='save')toast('Автоматический показ включён.')}catch(err){toast(err.message);await refresh()}
});
$('#phoneWizard').onsubmit=async e=>{
 e.preventDefault();try{
  if(!state.phone.latest)throw Error('Сначала дождись нового уведомления Kaspi.');
  let template=state.phone.latest.text;const replacements=[];
  for(const field of ['amount','name','message','balance']){
   const value=e.target.elements[field].value.normalize('NFKC').replace(/\s+/g,' ').trim();if(!value)continue;
   const at=template.indexOf(value);if(at<0)throw Error('Поле «'+field+'» не найдено. Скопируй его точно из уведомления.');
   if(template.indexOf(value,at+1)!==-1)throw Error('Значение «'+value+'» встречается несколько раз. Расставь поля вручную в разделе «Шаблоны распознавания».');
   if(replacements.some(r=>at<r.end&&at+value.length>r.at))throw Error('Значения полей пересекаются. Используй ручной шаблон.');
   replacements.push({at,end:at+value.length,field});
  }
  for(const r of replacements.sort((a,b)=>b.at-a.at))template=template.slice(0,r.at)+'{'+r.field+'}'+template.slice(r.end);
  $('#phoneTemplates').value=template;invalidatePhonePreview();await previewPhone();
 }catch(err){toast(err.message)}
};
async function previewPhone(){
 const templates=phoneTemplates();const r=await api('phone',{action:'preview',templates});
 phonePreviewId=r.sampleId;phonePreviewTemplates=JSON.stringify(templates);
 $('#phoneParsed').textContent='В эфир: '+r.parsed.name+' · '+money(r.parsed.amount)+' · '+(r.parsed.message||'без комментария');
 $('#phoneSave').disabled=!$('#phoneVerified').checked;
}
$('#phonePreview').onclick=async()=>{try{await previewPhone()}catch(e){invalidatePhonePreview();toast(e.message)}};
$('#phoneTemplates').addEventListener('input',invalidatePhonePreview);
$('#phoneVerified').onchange=()=>{$('#phoneSave').disabled=!phonePreviewId||!$('#phoneVerified').checked};
$('#phoneSave').onclick=async()=>{try{
 if(phonePreviewTemplates!==JSON.stringify(phoneTemplates()))throw Error('Шаблон изменился. Проверь его ещё раз.');
 await api('phone',{action:'save',templates:phoneTemplates(),sampleId:phonePreviewId,verified:$('#phoneVerified').checked});toast('Включено. Следующий подходящий перевод появится автоматически.');await refresh();
}catch(e){toast(e.message)}};
if(state)window.renderPhone();
