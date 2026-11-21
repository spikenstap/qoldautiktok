import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
for(const voice of ['iseke','raya']){await new Promise((resolve,reject)=>{const p=spawn(path.join(root,'runtime/piper/piper.exe'),['--model',path.join(root,`voices/kk_KZ-${voice}-x_low.onnx`),'--output_file',path.join(root,`samples/${voice}.wav`)],{windowsHide:true,cwd:path.join(root,'runtime/piper')});p.stdout.on('data',()=>{});p.stderr.on('data',x=>process.stderr.write(x));p.on('error',reject);p.on('close',c=>c===0?resolve():reject(Error('Piper exit '+c)));p.stdin.end('Сәлем! Қолдауыңызға рақмет. Әдемі ән, керемет көңіл күй. Бір мың теңге.\n','utf8')});console.log(voice+' sample ready')}
