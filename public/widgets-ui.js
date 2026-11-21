const widgetTypes=[
 {id:'alerts',name:'Донаты и озвучка',size:'640 × 600',color:'',preview:'Новый донат',description:'Анимация, имя, сумма и комментарий. Голос Iseke и загруженные эффекты.'},
 {id:'goal',name:'Цель сбора',size:'480 × 240',color:'cyan',preview:'Цель сбора',description:'Название цели, полученная сумма и полоса прогресса. Без звука.'},
 {id:'top',name:'Топ донатеров',size:'800 × 500',color:'gold',preview:'Топ за эфир',description:'Пять лидеров текущего эфира. Тесты исключены, одинаковые имена объединены.'},
 {id:'music',name:'Музыка YouTube',size:'520 × 380',color:'cyan',preview:'YouTube',description:'Официальный видеоплеер. Музыка приглушается, пока отдельный виджет показывает донат.'},
 {id:'all',name:'Общий экран',size:'1280 × 1080',color:'',preview:'DONATE OVERLAY',description:'Донаты, цель и топ в одном оформлении. При заказе музыки появляется YouTube-плеер.'},
];
function widgetLink(kind,embed=true){return (state.https?.url||location.origin)+(['goal','top'].includes(kind)?'/widget?type='+kind:'/overlay?widget='+kind+'&transparent=1'+(embed?'&embed=1':''))+'&token='+(state.https?.token||state.overlayKey)}
let widgetKey='';
window.renderWidgets=()=>{if(!state)return;const revision=state.overlayKey+(state.https?.url||'');if(widgetKey===revision)return;widgetKey=revision;let note=$('#httpsWidgetStatus');if(!note){note=document.createElement('p');note.id='httpsWidgetStatus';note.className='notice';$('#widgetCards').before(note)}note.textContent=state.https?'HTTPS-ссылки включены. Добавь нужную ссылку в LIVE Studio → Добавить источник → Ссылка. После перезапуска HTTPS адрес изменится.':'Сейчас доступны локальные ссылки. Для HTTPS запусти START-HTTPS.cmd из папки приложения — ссылки здесь обновятся автоматически.';$('#widgetCards').innerHTML=widgetTypes.map(w=>`<article class="panel widget-card"><div class="widget-thumb ${w.color}" aria-hidden="true"><strong>${w.preview}</strong><div class="mini-bars"><i></i><i></i><i></i></div></div><div class="widget-head"><h2>${w.name}</h2><small>${w.size} px</small></div><p>${w.description}</p><label class="widget-link-label">${state.https?'HTTPS-ссылка для LIVE Studio':'Локальная ссылка'}<input readonly aria-label="Ссылка: ${w.name}" value="${esc(widgetLink(w.id))}"></label><div class="actions"><button class="primary" data-copy-widget="${w.id}">Скопировать ссылку</button><button data-open-widget="${w.id}">Открыть виджет</button></div></article>`).join('')};
document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
 if(b.dataset.copyWidget){try{await navigator.clipboard.writeText(widgetLink(b.dataset.copyWidget));toast('Ссылка скопирована. Добавь её отдельным источником.')}catch{const input=b.closest('article').querySelector('input');input.focus();input.select();toast('Ссылка выделена. Нажми Ctrl+C.')}}
 if(b.dataset.openWidget)window.open(widgetLink(b.dataset.openWidget,false),'qoldau-'+b.dataset.openWidget,'popup,width=1000,height=800');
}catch(error){toast(error.message)}});
$('#widgetTest').onclick=async()=>{try{await api('test',{name:'Тестовый донат',amount:1500,message:'Рақмет! Бұл — жаңа виджеттің сынағы.'});toast('Тест отправлен в очередь донатов.');await refresh()}catch(error){toast(error.message)}};
if(state)window.renderWidgets();

