"""Reproducible monochrome diagrams, editable SVG and print-quality PNG.

The coordinates describe the implemented system, not a deployment proposal.
Run independently of build.py so the retained DOCX layout is not regenerated.
"""
from pathlib import Path
from html import escape
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent / 'assets'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
if not Path(FONT).exists():
    FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
SCALE = 2
INK = '#151515'


class Figure:
    def __init__(self, name, width, height):
        self.name, self.width, self.height = name, width, height
        self.image = Image.new('RGB', (width*SCALE, height*SCALE), 'white')
        self.draw = ImageDraw.Draw(self.image)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">', '<rect width="100%" height="100%" fill="white"/>']

    def rect(self, x, y, w, h, fill='white', stroke=INK, line=3):
        self.draw.rectangle(tuple(int(v*SCALE) for v in (x,y,x+w,y+h)), fill=fill, outline=stroke, width=line*SCALE)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{line}"/>')

    def text(self, x, y, value, size=50, bold=False, align='center', max_width=None):
        f = ImageFont.truetype(BOLD if bold else FONT, size*SCALE)
        if max_width:
            assert self.draw.textlength(value,font=f) <= max_width*SCALE, (self.name,value,max_width)
        anchor = 'mm' if align=='center' else 'lm'
        self.draw.text((x*SCALE,y*SCALE),value,font=f,fill=INK,anchor=anchor)
        self.svg.append(f'<text x="{x}" y="{y+size*.34}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" text-anchor="{ "middle" if align=="center" else "start"}" fill="{INK}">{escape(value)}</text>')

    def line(self, points, arrow=True, dashed=False, width=3):
        if dashed:
            for (x1,y1),(x2,y2) in zip(points,points[1:]):
                length=math.hypot(x2-x1,y2-y1)
                for i in range(0,int(length),22):
                    a,b=i/max(length,1),min(i+12,length)/max(length,1)
                    self.draw.line([(int((x1+(x2-x1)*t)*SCALE),int((y1+(y2-y1)*t)*SCALE)) for t in [a,b]],fill=INK,width=width*SCALE)
        else:
            self.draw.line([(int(x*SCALE),int(y*SCALE)) for x,y in points], fill=INK,width=width*SCALE)
        poly=' '.join(f'{x},{y}' for x,y in points)
        self.svg.append(f'<polyline points="{poly}" fill="none" stroke="{INK}" stroke-width="{width}"'+(' stroke-dasharray="12 10"' if dashed else '')+'/>')
        if arrow:
            x,y=points[-1];px,py=points[-2];angle=math.atan2(y-py,x-px)
            tri=[(x,y),(x-22*math.cos(angle-.44),y-22*math.sin(angle-.44)),(x-22*math.cos(angle+.44),y-22*math.sin(angle+.44))]
            self.draw.polygon([(int(a*SCALE),int(b*SCALE)) for a,b in tri],fill=INK)
            self.svg.append('<polygon points="'+' '.join(f'{a},{b}' for a,b in tri)+f'" fill="{INK}"/>')

    def label(self, x, y, value, size=43):
        f=ImageFont.truetype(FONT,size*SCALE)
        w=self.draw.textlength(value,font=f)/SCALE+24
        self.rect(x-w/2,y-size*.65,w,size*1.3,stroke='white',line=0)
        self.text(x,y,value,size)

    def box(self, x,y,w,h,title,lines=()):
        self.rect(x,y,w,h)
        content=[title,*lines];gap=63
        start=y+h/2-(len(content)-1)*gap/2
        for i,value in enumerate(content):
            self.text(x+w/2,start+i*gap,value,54 if i==0 else 48,i==0,max_width=w-40)

    def table(self,x,y,w,title,rows):
        row_h=67;h=88+len(rows)*row_h
        self.rect(x,y,w,h)
        self.rect(x,y,w,88,fill='#eeeeee')
        self.text(x+w/2,y+44,title,54,True,max_width=w-30)
        for i,value in enumerate(rows):self.text(x+24,y+88+row_h*(i+.5),value,47,align='left',max_width=w-48)
        return h

    def save(self):
        ROOT.mkdir(exist_ok=True)
        self.image.save(ROOT/(self.name+'.png'),dpi=(300,300),optimize=True)
        (ROOT/(self.name+'.svg')).write_text('\n'.join(self.svg+['</svg>']))


def architecture():
    f=Figure('architecture',2200,1580)
    f.box(760,40,680,150,'Браузер',['Наблюдатель и участники'])
    f.box(760,320,680,170,'Веб-вход',['Traefik в K3s → Nginx'])
    f.box(760,640,680,150,'Go API',['HTTP, роли, заказы'])
    f.box(40,640,530,150,'Node.js simulator',['Поток и движение'])
    f.box(210,1010,680,180,'PostgreSQL',['Заказы, водители, события'])
    f.box(1310,1010,680,180,'Redis',['Уведомления о работе'])
    f.box(760,1370,680,150,'Go dispatcher',['Назначения и тайм-ауты'])
    f.line([(1100,190),(1100,320)]);f.label(1100,255,'HTTP')
    f.line([(1100,490),(1100,640)]);f.label(1100,560,'HTTP /api')
    f.line([(570,715),(760,715)]);f.label(665,670,'HTTP')
    f.line([(925,790),(925,900),(550,900),(550,1010)]);f.label(720,900,'SQL / commit')
    f.line([(1275,790),(1275,900),(1650,900),(1650,1010)]);f.label(1500,900,'LPUSH')
    f.line([(925,1370),(925,1290),(550,1290),(550,1190)]);f.label(720,1290,'SQL / транзакция')
    f.line([(1275,1370),(1275,1290),(1650,1290),(1650,1190)]);f.label(1510,1290,'BRPOP')
    f.save()


def data():
    f=Figure('data',2200,1580)
    f.table(30,200,590,'drivers',['PK id; name','class; x; y','status'])
    f.table(780,200,660,'orders',['PK id; owner_id','class; origin','pickup_x; pickup_y','dropoff_x; dropoff_y','status; FK driver_id','offer_expires','created_at; updated_at'])
    f.table(1610,200,560,'attempts',['PK, FK order_id','PK, FK driver_id','created_at'])
    f.table(780,1050,660,'events',['PK id; order_id','service; kind','message; created_at'])
    f.table(30,1050,590,'demo_settings',['PK singleton','running; scenario'])
    f.line([(620,355),(780,355)]);f.label(700,155,'0..1 : 0..N',40)
    f.line([(1440,355),(1610,355)]);f.label(1525,155,'1 : 0..N',40)
    f.line([(325,200),(325,85),(1890,85),(1890,200)]);f.label(1100,85,'drivers → attempts: 1 : 0..N')
    f.line([(1110,1050),(1110,757)],dashed=True);f.label(1110,905,'Связь по order_id; без FK')
    f.text(1100,1450,'UNIQUE driver_id только для активных состояний orders',48)
    f.text(1100,1520,'Сплошная линия — внешний ключ; пунктир — логическая связь',43)
    f.save()


def lifecycle():
    f=Figure('lifecycle',2200,1490)
    states=[('pending','Ожидание назначения'),('offered','Предложение водителю'),('accepted','Движение к подаче'),('arrived','Ожидание пассажира'),('in_progress','Поездка'),('completed','Завершение')]
    for i,(s,d) in enumerate(states):f.box(700,40+i*220,760,135,s,[d])
    for i,action in enumerate(['Назначение','accept','arrive','start','complete']):
        y=175+i*220;f.line([(1080,y),(1080,y+85)]);f.label(1080,y+42,action)
    f.line([(700,327),(360,327),(360,107),(700,107)])
    f.label(350,430,'decline / тайм-аут',42)
    for i in range(4):f.line([(1460,107+i*220),(1860,107+i*220)],arrow=False)
    f.line([(1860,107),(1860,930)])
    f.box(1590,930,540,150,'cancelled',['Отмена до поездки'])
    f.label(1850,850,'cancel',44)
    f.text(1090,1400,'После start отмена запрещена; недопустимые действия → HTTP 409',44)
    f.save()


def pipeline():
    f=Figure('pipeline',2200,1680)
    stages=[('Push / pull request',['Исходный код и конфигурация']),('Проверки и сборка',['Go vet, test -race; Node.js tests']),('Docker Compose',['Два dispatcher; прогон без Redis']),('Временный кластер k3d',['Импорт образов; Helm install']),('HTTP-проверки через Ingress',['Ожидание маршрута; smoke-сценарий']),('Публикация в GHCR',['Только main: app, web, simulator','linux/amd64 и linux/arm64; тег SHA'])]
    ys=[40,280,520,760,1000,1240]
    for i,(title,lines) in enumerate(stages):
        f.box(400,ys[i],1400,170 if i<5 else 220,title,lines)
        if i<5:f.line([(1100,ys[i]+170),(1100,ys[i+1])])
    f.text(1100,1565,'Облачный выпуск выполняется отдельно; Terraform apply не запускался',45)
    f.save()


def dispatch():
    f=Figure('dispatch',2200,2090)
    steps=[('Начало итерации',['BEGIN; pg_try_advisory_xact_lock']),('Координатор занят?',['Да → завершить итерацию без ожидания']),('Освободить истёкшие предложения',['offered → pending; водитель → available']),('Выбрать ожидающий заказ',['Старейший заказ с доступным кандидатом']),('Выбрать ближайшего водителя',['Совместимый класс; нет недавнего отказа','Дорожное расстояние; при равенстве — id']),('Зафиксировать предложение',['driver → offered; order → offered','attempts + event в той же транзакции']),('Завершение',['COMMIT; блокировка освобождается'])]
    ys=[40,300,560,820,1080,1410,1840]
    hs=[160,160,160,160,220,220,160]
    for i,(title,lines) in enumerate(steps):
        f.box(380,ys[i],1440,hs[i],title,lines)
        if i<len(steps)-1:f.line([(1100,ys[i]+hs[i]),(1100,ys[i+1])])
    f.line([(1820,380),(2020,380),(2020,465)])
    f.box(1870,465,300,170,'Выход',['Rollback'])
    f.label(2000,335,'Да',48)
    f.label(1100,510,'Нет',45)
    f.label(1100,1740,'Повтор выбора: до 32 назначений за транзакцию',44)
    f.line([(380,1520),(180,1520),(180,900),(380,900)])
    f.label(230,1240,'Есть ещё',40)
    f.text(1100,2050,'Нет подходящего заказа → COMMIT; строки выбираются FOR UPDATE SKIP LOCKED',43)
    f.save()


def sequence():
    f=Figure('sequence',2200,1500)
    xs=[220,660,1100,1540,1980]
    for x,name in zip(xs,['Клиент','Go API','PostgreSQL','Redis','Dispatcher']):
        f.box(x-200,40,400,100,name)
        f.line([(x,140),(x,1420)],arrow=False,dashed=True,width=2)
    messages=[(0,1,250,'1. POST /api/orders'),(1,2,390,'2. INSERT order + event'),(2,1,530,'3. Фиксация успешна'),(1,3,670,'4. LPUSH: сигнал'),(1,0,810,'5. HTTP 201'),(4,3,950,'6. BRPOP'),(4,2,1090,'7. Чтение pending; назначение')]
    for a,b,y,label in messages:
        f.line([(xs[a],y),(xs[b],y)])
        f.label((xs[a]+xs[b])/2,y-43,label,42)
    f.line([(xs[4],1300),(xs[2],1300)],dashed=True)
    f.label(1540,1248,'Резерв: периодическое сканирование БД',42)
    f.save()


def kubernetes():
    f=Figure('kubernetes',2200,1800)
    f.rect(25,25,2150,1740,stroke='#777777',line=2)
    f.text(1100,95,'namespace taxi · K3s: один server и два agent в k3d',53,True)
    rows=[('Внешний HTTP',['Ingress / Traefik → Service web'],'web',['Deployment; 2 реплики Nginx']),('Внутренний HTTP',['Service api:8080'],'api',['Deployment; 2 реплики Go']),('Фоновая обработка',['Сеть namespace; без Service'],'dispatcher',['Deployment; 2 реплики Go']),('Модель движения',['HTTP к Service api'],'simulator',['Deployment; 1 реплика Node.js']),('Постоянное хранение',['Service postgres:5432'],'PostgreSQL',['StatefulSet; PVC local-path']),('Уведомления',['Service redis:6379'],'Redis',['Deployment; без постоянного тома'])]
    for i,(title,lines,target,desc) in enumerate(rows):
        y=200+i*240
        f.box(85,y,900,160,title,lines)
        f.box(1215,y,900,160,target,desc)
        f.line([(985,y+80),(1215,y+80)])
    f.text(1100,1715,'Узлы k3d находятся на одном хосте; PostgreSQL — одиночный',46)
    f.save()


if __name__=='__main__':
    for build in [architecture,data,lifecycle,pipeline,dispatch,sequence,kubernetes]:build()
    print('Seven diagrams written as editable SVG and 300 dpi PNG.')
