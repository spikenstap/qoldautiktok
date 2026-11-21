// Explicit visual demo only. It never calls payment, player or donation APIs.
document.body.dataset.widget='all';
document.querySelector('#startPanel').remove();document.querySelector('#stageControls').remove();document.querySelector('#showControls').remove();document.querySelector('#musicBox').remove();
document.querySelector('#overlayHeader p').textContent='Предпросмотр оформления · вымышленные суммы';
document.querySelector('#overlayHeader .pill').textContent='ДЕМО';
document.querySelector('#alert').hidden=false;
document.querySelector('#donor').textContent='Айдос_KZ';document.querySelector('#amount').textContent='1 500 ₸';document.querySelector('#message').textContent='Удачи в рейтинге, братан!';
document.querySelector('#goalBox').hidden=false;
window.renderWidgetData({goalName:'Новый микрофон',goalAmount:60000,total:32400,top:[{name:'Nurlan_Play',amount:12000},{name:'Aigerim.live',amount:8200},{name:'Timur_GG',amount:5000},{name:'Айдос_KZ',amount:1500}]});
function layout(){const small=innerWidth<=650,a=document.querySelector('#alert'),g=document.querySelector('#goalBox');g.style.top=(small?100+a.offsetHeight+24:115)+'px';document.querySelector('#topBox').style.top=(small?100+a.offsetHeight+24+g.offsetHeight+24:115+Math.max(a.offsetHeight,g.offsetHeight)+24)+'px'}
new ResizeObserver(layout).observe(document.querySelector('#alert'));addEventListener('resize',layout);layout();

// Isolated layout preview. No donation or playback APIs are called.
const previewQuery=new URLSearchParams(location.search);if(previewQuery.has('alert')){document.body.dataset.widget='alerts';document.body.classList.add('transparent','embedded');document.querySelector('#donor').textContent='Тестовый донат';document.querySelector('#message').textContent='Сәлем! Это пример комментария.';const media=previewQuery.get('media')||'';if(/^\/media\/[a-f0-9-]+\.(gif|png|jpg|jpeg|webp|mp4|webm)$/.test(media)){const video=/\.(mp4|webm)$/.test(media),element=document.createElement(video?'video':'img');element.src=media;if(video){element.autoplay=true;element.loop=true;element.muted=true;element.playsInline=true}else element.alt='Анимация доната';document.querySelector('#visual').append(element)}}
