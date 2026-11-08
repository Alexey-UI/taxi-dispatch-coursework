/** Update the retained nine-slide deck without rebuilding the coursework.
 * Dependencies: @oai/artifact-tool from the supplied authoring runtime.
 * Personal outputs belong outside the public repository.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map((a,i,all)=>a.startsWith('--')?[a.slice(2),all[i+1]]:null).filter(Boolean));
const modules=process.env.RUNTIME_NODE_MODULES;
if(!modules)throw new Error('Set RUNTIME_NODE_MODULES to the supplied runtime node_modules');
const require=createRequire(path.join(modules,'__runtime__.cjs'));
const {PresentationFile,FileBlob}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const input=path.resolve(args.input||path.join(root,'output/Презентация_Тактика.pptx'));
const output=path.resolve(args.output||'/tmp/taxi-slides/draft.pptx');
const p=await PresentationFile.importPptx(await FileBlob.load(input));
if(p.slides.items.length!==9)throw new Error('Expected the retained nine-slide deck');
const bodies={
 1:[
  'Система автоматической обработки и распределения заказов «Тактика»',
  'Дисциплина: Настройка и администрирование сервисного ПО',
  args.author?`${args.author}, группа ${args.group||'__________'}`:'Студент: __________________   Группа: __________',
  `Руководитель: ${args.supervisor||'__________________'}`,
  'РТУ МИРЭА, ИИТ, кафедра ИиППО. Москва, 2026'
 ],
 2:[
  'Цель: разработать и настроить систему распределения заказов такси.',
  'Подбор водителя по классу, доступности и расстоянию по дорогам.',
  'Отказы, тайм-ауты и повторный поиск исполнителя.',
  'Запуск в контейнерах, Kubernetes, CI/CD и восстановление данных.'
 ],
 3:[
  'Наблюдатель следит за картой и событиями без входа.',
  'Пассажир создаёт заказ. Водитель принимает его и отмечает этапы.',
  'Диспетчер управляет симуляцией и четырьмя сценариями.',
  'Город 200 × 140 единиц. Автомобили движутся по уличной сетке.'
 ],
 4:[
  'Go: HTTP API и dispatcher. JavaScript и Node.js: интерфейс и симуляция.',
  'PostgreSQL хранит заказы. Redis уведомляет о новой работе.',
  'Compose запускает шесть компонентов на Mac, Windows и Linux.',
  'k3d запускает локальный K3s. Helm устанавливает приложение.'
 ],
 9:[
  'Стенд работает в Compose и трёхузловом локальном Kubernetes.',
  'Проверены назначения, отказы, тайм-ауты и работа без Redis.',
  'После удаления API-подов кластер восстановил реплики.',
  'Дамп PostgreSQL восстановлен в отдельную БД. Образы доступны в GHCR.',
  'Для Yandex Cloud подготовлены конфигурации. Облачный запуск не выполнялся.'
 ]
};
const titles={1:'Настройка и администрирование системы такси',2:'Цель и задачи',3:'Возможности приложения',4:'Технологии и варианты запуска',5:'Архитектура сервиса',6:'Назначение и состояния заказа',7:'Карта и сценарии симуляции',8:'Проверки и доставка в GitHub Actions',9:'Результаты работы'};
const notes=[
 'Тема курсовой: «Настройка и администрирование системы автоматической обработки и распределения заказов для службы такси». Представить разработанный комплекс «Тактика».',
 'Объяснить задачу выбора исполнителя и сохранения согласованного состояния заказа и водителя. Для economy подходят economy и comfort, для comfort только comfort.',
 'Четыре сценария: обычный поток, отказы, дефицит и всплеск. Пауза останавливает автоматические ответы и движение, dispatcher продолжает работать. Основа: docs/requirements.md и docs/roads.md.',
 'Compose: localhost:8088. Локальный Kubernetes: taxi.localhost:8089. В K3s web, API и dispatcher имеют по две реплики, simulator одну. База PostgreSQL одиночная. Источники: compose.yaml, deploy/k3d.yaml, deploy/helm/taxi/values.yaml.',
 'API и dispatcher используют общий Go-модуль и разные роли процесса. API сохраняет заказ в PostgreSQL и после commit отправляет уведомление Redis. При пропуске сигнала dispatcher находит заказ сканированием. Источник: docs/architecture.md, internal/store.go.',
 'Предложение действует 12 секунд. Отказ или истечение возвращают заказ в pending. Повтор тому же водителю разрешается через 30 секунд. Транзакционная advisory-блокировка согласует два dispatcher, блокировки строк и частичный уникальный индекс защищают активные назначения. Источник: internal/store.go и internal/domain.go.',
 'Показать карту, путь подачи и поездки, события и заказ. Скорость по умолчанию 1,2 единицы в секунду, длина сгенерированной поездки от 45 единиц. Скриншот получен из работающего локального приложения. Источник: docs/roads.md и report/assets/desktop.png.',
 'Конвейер проверяет Go с race detector и Node.js, запускает Compose с двумя dispatcher и без Redis, затем временный k3d и Helm. Пример успешной дорожной версии: https://github.com/Alexey-UI/taxi-dispatch-coursework/actions/runs/40666790611 . Три образа для amd64 и arm64 публикуются после успешных проверок main. Облако устанавливается оператором отдельно. Источник: .github/workflows/ci.yml.',
 'PostgreSQL и хост остаются одиночными. Подготовлены Terraform-заготовка, облачные values, настройка домена и cert-manager. Облачные ресурсы не создавались. Результаты: docs/validation.md. Исходники: https://github.com/Alexey-UI/taxi-dispatch-coursework .'
];
function addText(slide,name,text,frame,size=23){
 let box=slide.shapes.items.find(x=>x.name===name);
 if(!box)box=slide.shapes.add({geometry:'textbox',name,position:frame,fill:'none',line:{fill:'none',width:0}});
 box.text=text;box.position=frame;box.text.insets=0;
 box.text.style={fontFamily:'Calibri',fontSize:size,color:'#33442D'};
 return box;
}
for(const [idx,s] of p.slides.items.entries()){
 const number=idx+1;
 s.shapes.items.find(x=>x.id==='2').text=titles[number];
 if(bodies[number]){
  const body=s.shapes.items.find(x=>x.id==='3');
  const old=String(body.text).split('\n');
  if(old.length!==bodies[number].length)throw new Error(`Body paragraph count differs on slide ${number}`);
  for(let i=0;i<old.length;i++)body.text.replace(old[i],bodies[number][i]);
 }
 s.speakerNotes.text=notes[idx];
 const footer=s.shapes.items.find(x=>x.id==='4');
 footer.text=`РТУ МИРЭА · Тактика · 2026`;
 addText(s,'page-number',String(number).padStart(2,'0'),{left:1192,top:683,width:35,height:22},13.33);
 if([5,6,8].includes(number)){
  const asset={5:'architecture',6:'lifecycle',8:'pipeline'}[number];
  const bytes=await fs.readFile(path.join(root,'assets',asset+'.png'));
  const img=s.images.items[0];
  img.replace({blob:bytes,contentType:'image/png',fit:'contain',alt:titles[number]});
  const ratio={5:2200/1580,6:2200/1490,8:2200/1680}[number];
  const height=520,width=height*ratio;
  img.frame={left:1250-width,top:140,width,height};img.crop={left:0,top:0,right:0,bottom:0};
  const lines={
   5:['Шесть компонентов','API и dispatcher на Go','Заказы в PostgreSQL','Redis уведомляет обработчик','Nginx принимает HTTP'],
   6:['Ближайший по дорогам','Учёт класса автомобиля','12 секунд на ответ','Отказ запускает поиск','Один активный заказ'],
   8:['Тесты Go и Node.js','Compose и отказ Redis','k3d, Helm и Ingress','Три образа в GHCR','Теги по SHA коммита']
  }[number];
  lines.forEach((v,j)=>addText(s,`detail-${j}`,v,{left:68,top:205+j*72,width:370,height:54},25));
 }
 if(number===7){
  const img=s.images.items[0];img.frame={left:650,top:140,width:462.7454,height:532.8};
  ['Движение только по дорогам','Подача жёлтым, поездка зелёным','Масштаб и полноэкранный режим','Четыре сценария симуляции','Поток, отказы, дефицит, всплеск'].forEach((v,j)=>addText(s,`detail-${j}`,v,{left:68,top:220+j*65,width:540,height:52},25));
 }
}
await fs.mkdir(path.dirname(output),{recursive:true});
await(await PresentationFile.exportPptx(p)).save(output);
console.log('Updated nine-slide deck:',output);
