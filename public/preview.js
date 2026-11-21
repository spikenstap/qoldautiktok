// Explicit visual demo only. It never calls payment, player or donation APIs.
document.body.dataset.widget='all';
document.querySelector('#startPanel').remove();document.querySelector('#stageControls').remove();document.querySelector('#showControls').remove();document.querySelector('#musicBox').remove();
document.querySelector('#overlayHeader p').textContent='Предпросмотр оформления · вымышленные суммы';
document.querySelector('#overlayHeader .pill').textContent='ДЕМО';
document.querySelector('#alert').hidden=false;document.querySelector('#testBadge').textContent='ДЕМО';
document.querySelector('#donor').textContent='Айдос_KZ';document.querySelector('#amount').textContent='1 500 ₸';document.querySelector('#message').textContent='Удачи в рейтинге, братан!';
document.querySelector('#goalBox').hidden=false;
window.renderWidgetData({goalName:'Новый микрофон',goalAmount:60000,total:32400,top:[{name:'Nurlan_Play',amount:12000},{name:'Aigerim.live',amount:8200},{name:'Timur_GG',amount:5000},{name:'Айдос_KZ',amount:1500}]});
function layout(){const small=innerWidth<=650,a=document.querySelector('#alert'),g=document.querySelector('#goalBox');g.style.top=(small?100+a.offsetHeight+24:115)+'px';document.querySelector('#topBox').style.top=(small?100+a.offsetHeight+24+g.offsetHeight+24:115+Math.max(a.offsetHeight,g.offsetHeight)+24)+'px'}
new ResizeObserver(layout).observe(document.querySelector('#alert'));addEventListener('resize',layout);layout();
