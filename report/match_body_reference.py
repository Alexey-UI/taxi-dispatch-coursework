"""Apply the new report's formatting while retaining approved covers and taxi content."""
from __future__ import annotations
import argparse,copy,hashlib,json,re
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS={'w':W,'r':R}
def q(s):return '{'+W+'}'+s
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=NS))
def xml(e):return E.tostring(e,xml_declaration=True,encoding='UTF-8',standalone=True)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--reference',required=True,type=Path);ap.add_argument('--input',required=True,type=Path);ap.add_argument('--output',required=True,type=Path);ap.add_argument('--pages',type=int);ap.add_argument('--page-map',type=Path);a=ap.parse_args()
 refhash=hashlib.sha256(a.reference.read_bytes()).hexdigest()
 with ZipFile(a.reference) as z:ref={n:z.read(n) for n in z.namelist()}
 with ZipFile(a.input) as z:parts={n:z.read(n) for n in z.namelist()}
 doc=E.fromstring(parts['word/document.xml']);body=doc.find('w:body',NS);rdoc=E.fromstring(ref['word/document.xml']);rp=rdoc.findall('w:body/w:p',NS);rt=rdoc.findall('w:body/w:tbl',NS)
 styles=E.fromstring(parts['word/styles.xml']);rstyles=E.fromstring(ref['word/styles.xml']);prefix='NewRef_';stylemap={s.get(q('styleId')):prefix+s.get(q('styleId')) for s in rstyles.findall('w:style',NS)}
 def clone(e):
  c=copy.deepcopy(e)
  for n in c.iter():
   if n.tag in [q('pStyle'),q('rStyle'),q('tblStyle'),q('basedOn'),q('next'),q('link')] and n.get(q('val')) in stylemap:n.set(q('val'),stylemap[n.get(q('val'))])
  return c
 # Keep pre-existing definitions intact so the approved covers do not change.
 for s in list(styles):
  if s.get(q('styleId'),'').startswith(prefix):styles.remove(s)
 for s in rstyles.findall('w:style',NS):
  c=clone(s);c.set(q('styleId'),stylemap[s.get(q('styleId'))]);c.attrib.pop(q('default'),None)
  name=c.find('w:name',NS)
  if name is not None:name.set(q('val'),'Report reference '+name.get(q('val')))
  styles.append(c)
 def format_p(p,prototype,keep=False):
  old=p.find('w:pPr',NS);oldbreak=old is not None and old.find('w:pageBreakBefore',NS) is not None
  if old is not None:p.remove(old)
  pp=clone(prototype.find('w:pPr',NS)) if prototype.find('w:pPr',NS)is not None else E.Element(q('pPr'))
  for s in pp.findall('w:sectPr',NS):pp.remove(s)
  if oldbreak and pp.find('w:pageBreakBefore',NS)is None:E.SubElement(pp,q('pageBreakBefore'))
  if keep and pp.find('w:keepNext',NS)is None:E.SubElement(pp,q('keepNext'))
  p.insert(0,pp)
  rpr=prototype.find('.//w:r/w:rPr',NS)
  for run in p.findall('.//w:r',NS):
   old=run.find('w:rPr',NS)
   if old is not None:run.remove(old)
   if rpr is not None:run.insert(0,clone(rpr))
 def style_id(p):
  x=p.find('w:pPr/w:pStyle',NS);return x.get(q('val')) if x is not None else ''
 toc={}
 for p in rdoc.xpath('//w:sdt//w:p',namespaces=NS):
  sid=style_id(p)
  if sid and sid not in toc:toc[sid]=p
 toc_by_level={1:toc['11'],2:toc['21'],3:toc['31']}
 toc_title=next(p for p in rdoc.xpath('//w:sdt//w:p',namespaces=NS) if text(p)=='СОДЕРЖАНИЕ')
 started=False;in_refs=False;ref_no=0;glossary=0;last_toc=None;covers=[];before_text=[]
 page_map=json.loads(a.page_map.read_text()) if a.page_map else {}
 for child in list(body):
  if child.tag==q('p') and text(child)=='РЕФЕРАТ':started=True
  if not started:covers.append(xml(child));continue
  if child.tag==q('tbl'):
   rows=child.findall('w:tr',NS);cols=len(rows[0].findall('w:tc',NS));code=cols==1
   kind=0 if glossary==1 else 1 if glossary==2 else 3 if code else 2
   proto=rt[kind];pp=child.find('w:tblPr',NS)
   if pp is not None:child.remove(pp)
   child.insert(0,clone(proto.find('w:tblPr',NS)))
   widths=[3256,6089] if kind==0 else [3964,5381] if kind==1 else [9345//cols]*cols
   widths[-1]+=9345-sum(widths)
   grid=child.find('w:tblGrid',NS)
   for n,width in zip(grid,widths):n.set(q('w'),str(width))
   prows=proto.findall('w:tr',NS)
   for i,row in enumerate(rows):
    pcs=prows[min(i,len(prows)-1)].findall('w:tc',NS)
    for j,tc in enumerate(row.findall('w:tc',NS)):
     source=pcs[min(j,len(pcs)-1)];tcpr=tc.find('w:tcPr',NS)
     if tcpr is not None:tc.remove(tcpr)
     tcpr=clone(source.find('w:tcPr',NS));w=tcpr.find('w:tcW',NS)
     if w is not None:w.set(q('w'),str(widths[j]))
     tc.insert(0,tcpr)
     for p in tc.findall('w:p',NS):format_p(p,source.find('w:p',NS),keep=False)
   glossary=0
   continue
  if child.tag!=q('p'):continue
  p=child;t=text(p);sid=style_id(p)
  # The new template numbers subsections without an extra terminal dot.
  for node in p.xpath('.//w:t',namespaces=NS):
   if node.text:node.text=re.sub(r'^([23]\.\d+)\. ',r'\1 ',node.text)
  t=text(p)
  if sid in ['11','21','31'] or sid in [prefix+'11',prefix+'21',prefix+'31']:
   level={'11':1,'21':2,'31':3,prefix+'11':1,prefix+'21':2,prefix+'31':3}[sid];format_p(p,toc_by_level[level]);last_toc=p
   nodes=p.xpath('.//w:t',namespaces=NS)
   if len(nodes)>=2 and nodes[0].text in page_map:nodes[-1].text=str(page_map[nodes[0].text])
   continue
  if p.find('.//w:drawing',NS)is not None:format_p(p,rp[56],True);continue
  if t=='СОДЕРЖАНИЕ':format_p(p,toc_title);continue
  if t=='РЕФЕРАТ':format_p(p,rp[0],True);continue
  if t in ['ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ','ПЕРЕЧЕНЬ СОКРАЩЕНИЙ И ОБОЗНАЧЕНИЙ']:glossary=1 if t.startswith('ТЕРМИНЫ') else 2
  if t=='СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ':in_refs=True
  if t=='ПРИЛОЖЕНИЯ':in_refs=False
  if sid in ['1',prefix+'1']:format_p(p,rp[18],True)
  elif sid in ['2',prefix+'2']:
   format_p(p,rp[42],True)
   if t.startswith('Глава 2.'):
    pp=p.find('w:pPr',NS)
    for n in pp.findall('w:pageBreakBefore',NS):pp.remove(n)
  elif sid in ['3',prefix+'3']:format_p(p,rp[77],True)
  elif t.startswith('Рисунок '):format_p(p,rp[57])
  elif t.startswith('Таблица '):format_p(p,rp[53],True)
  elif t.startswith('Листинг '):format_p(p,rp[84],True)
  elif t.startswith('Приложение '):format_p(p,rp[221],True)
  elif t=='Структура проекта':format_p(p,rp[222],True)
  elif in_refs and t:
   ref_no+=1;format_p(p,rp[204]);node=p.find('.//w:t',NS)
   if not re.match(r'^\d+\. ',t):node.text=f'{ref_no}. '+(node.text or '')
  else:format_p(p,rp[43])
  if a.pages and t.startswith('(ИиППО)'):
   node=p.find('.//w:t',NS);node.text=re.sub(r'– \d+ с\.',f'– {a.pages} с.',node.text)
 # Use the reference's blank preliminary footer and numbered main footer.
 rels=E.fromstring(parts['word/_rels/document.xml.rels']);relNS='http://schemas.openxmlformats.org/package/2006/relationships'
 for footer,filename,rid in [('footer1.xml','new-reference-blank.xml','rIdNewRefBlank'),('footer2.xml','new-reference-page.xml','rIdNewRefPage')]:
  parts['word/'+filename]=xml(clone(E.fromstring(ref['word/'+footer])))
  for r in list(rels):
   if r.get('Id')==rid:rels.remove(r)
  E.SubElement(rels,'{'+relNS+'}Relationship',Id=rid,Type=R+'/footer',Target=filename)
  ct=E.fromstring(parts['[Content_Types].xml']);ctNS='http://schemas.openxmlformats.org/package/2006/content-types'
  if not any(x.get('PartName')=='/word/'+filename for x in ct):E.SubElement(ct,'{'+ctNS+'}Override',PartName='/word/'+filename,ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml')
  parts['[Content_Types].xml']=xml(ct)
 assert last_toc is not None
 pp=last_toc.find('w:pPr',NS)
 for sec in pp.findall('w:sectPr',NS):pp.remove(sec)
 prelim=clone(rdoc.find('.//w:pPr/w:sectPr',NS));prelim.find('w:footerReference',NS).set('{'+R+'}id','rIdNewRefBlank');pp.append(prelim)
 final=body.find('w:sectPr',NS)
 final.find('w:footerReference',NS).set('{'+R+'}id','rIdNewRefPage')
 parts['word/styles.xml']=xml(styles);parts['word/document.xml']=xml(doc);parts['word/_rels/document.xml.rels']=xml(rels)
 assert [xml(c) for c in list(body)[:len(covers)]]==covers,'cover changed'
 for name,data in parts.items():
  if name.startswith('word/media/'):
   with ZipFile(a.input) as z:assert z.read(name)==data
 with ZipFile(a.output,'w',ZIP_DEFLATED) as z:
  for name,data in parts.items():z.writestr(name,data)
 assert hashlib.sha256(a.reference.read_bytes()).hexdigest()==refhash
 print('Body formatting applied; approved covers, images and source reference preserved.')
if __name__=='__main__':main()
