"""Apply the retained coursework's real OOXML components to the taxi report.

The reference stays outside the public repository. Personalized deliverables
are written outside it too. No body text, tables, code or figures are discarded.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from lxml import etree as ET
from PIL import Image

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'w': W, 'r': R, 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'}
ROOT = Path(__file__).resolve().parent
SUBJECT = 'Настройка и администрирование системы автоматической обработки и распределения заказов для службы такси'
CHAPTERS = {
    '1': 'Глава 1. Анализ предметной области',
    '2': 'Глава 2. Концепция программного продукта и процесса его настройки',
    '3': 'Глава 3. Процесс настройки разработанного программного продукта. Тестирование работы системы',
}


def q(name):
    return f'{{{W}}}{name}'


def text_of(element):
    return ''.join(element.xpath('.//w:t/text()', namespaces=NS))


def xml(element):
    return ET.tostring(element, xml_declaration=True, encoding='UTF-8', standalone=True)


def replace_text(element, old, new):
    """Replace across Word run boundaries while retaining the original runs."""
    nodes = element.xpath('.//w:t', namespaces=NS)
    full = ''.join(t.text or '' for t in nodes)
    if old not in full:
        return
    start = full.index(old)
    end = start + len(old)
    offset = 0
    for node in nodes:
        value = node.text or ''
        left, right = offset, offset + len(value)
        if right > start and left < end:
            prefix = value[:max(0, start - left)]
            suffix = value[max(0, end - left):]
            node.text = prefix + (new if left <= start < right else '') + suffix
            node.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        offset = right


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=ROOT.parent.parent / 'Готовая_курсовая')
    parser.add_argument('--author', default='_______________________________')
    parser.add_argument('--group', default='________________')
    parser.add_argument('--supervisor', default=None)
    parser.add_argument('--due-date', default=None)
    parser.add_argument('--pages', type=int, default=37)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    reference_hash = hashlib.sha256(args.reference.read_bytes()).hexdigest()
    with ZipFile(args.reference) as source_zip:
        package = {name: source_zip.read(name) for name in source_zip.namelist()}
    document = ET.fromstring(package['word/document.xml'])
    body = document.find('w:body', NS)
    source_paragraphs = body.findall('w:p', NS)
    source_tables = body.findall('w:tbl', NS)
    old_author = text_of(source_paragraphs[10]).removeprefix('Студент: ')
    old_group = text_of(source_paragraphs[11]).removeprefix('Группа: ')
    old_subject = text_of(source_paragraphs[8]).removeprefix('Тема: ')
    old_parts = old_author.split()
    old_signature = f'{old_parts[1][0]}.{old_parts[2][0]}. {old_parts[0]}'
    old_supervisor = text_of(source_paragraphs[15]).removeprefix('Руководитель: ').split(',')[0]
    author_parts = args.author.split()
    if len(author_parts) >= 3:
        surname = author_parts[0]
        initials = f'{author_parts[1][0]}. {author_parts[2][0]}.'
        author_short = f'{surname} {initials}'
        signature = f'{initials.replace(" ", "")} {surname}'
    else:
        surname, author_short, signature = '____________', args.author, '________________'

    # Source first two pages, including crest, header tables and section break.
    boundary = source_paragraphs[51]
    prefix = []
    for child in body:
        prefix.append(copy.deepcopy(child))
        if child is boundary:
            break
    title_boundary = source_paragraphs[26]
    title_count = list(body).index(title_boundary) + 1
    for element in prefix:
        replace_text(element, old_subject, SUBJECT)
        replace_text(element, old_author, args.author)
        replace_text(element, old_signature, signature)
        replace_text(element, old_group, args.group)
        if args.supervisor:
            replace_text(element, old_supervisor, args.supervisor)
        if args.due_date:
            replace_text(element, '13.11.2026', args.due_date)
    # Retain the template's wording, labels and underline formatting, use our stack.
    for element in prefix:
        replace_text(element,
                     'docker, docker compose, docker swarm, kubernetes, dockerfile, docker-compose.yaml',
                     'Go, JavaScript, PostgreSQL, Redis, Docker, Docker Compose, Kubernetes, Helm, Dockerfile, compose.yaml')

    section = copy.deepcopy(body.find('w:sectPr', NS))
    for child in list(body):
        body.remove(child)
    for element in prefix:
        body.append(element)

    def para(prototype, value='', page_break=False, keep=False, style=None):
        p = ET.Element(q('p'))
        source_ppr = prototype.find('w:pPr', NS)
        pp = copy.deepcopy(source_ppr) if source_ppr is not None else ET.Element(q('pPr'))
        for item in list(pp):
            if item.tag in (q('sectPr'), q('pageBreakBefore')):
                pp.remove(item)
        if page_break:
            ET.SubElement(pp, q('pageBreakBefore'))
        if keep and pp.find('w:keepNext', NS) is None:
            ET.SubElement(pp, q('keepNext'))
        if style:
            existing = pp.find('w:pStyle', NS)
            if existing is None:
                existing = ET.Element(q('pStyle'))
                pp.insert(0, existing)
            existing.set(q('val'), style)
        p.append(pp)
        run = ET.SubElement(p, q('r'))
        rpr = prototype.find('.//w:r/w:rPr', NS)
        if rpr is not None:
            run.append(copy.deepcopy(rpr))
        t = ET.SubElement(run, q('t'))
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        t.text = value
        return p

    headings = []
    bookmark_number = 5000

    def heading(value, level=1, new_page=True, prototype=None):
        nonlocal bookmark_number
        pp = para(prototype if prototype is not None else source_paragraphs[{1: 72, 2: 105, 3: 106}[level]], value,
                  page_break=new_page, keep=True)
        anchor = f'TaxiSection{bookmark_number}'
        mark = ET.Element(q('bookmarkStart'), {q('id'): str(bookmark_number), q('name'): anchor})
        pp.insert(1, mark)
        pp.append(ET.Element(q('bookmarkEnd'), {q('id'): str(bookmark_number)}))
        bookmark_number += 1
        headings.append((value, level, anchor))
        body.append(pp)
        return pp

    def text(value, prototype=89):
        p = para(source_paragraphs[prototype], value)
        body.append(p)
        return p

    # The concise section is named exactly as the new reference, body retained.
    heading('РЕФЕРАТ', prototype=source_paragraphs[52], new_page=False)
    headings.clear()  # Reference TOC starts at terms, not at the abstract.
    text(text_of(source_paragraphs[53]), 53)
    text(f'{author_short}, Курсовая работа направления подготовки «Программная инженерия» на тему «{SUBJECT}»: М. 2026 г., МИРЭА – Российский технологический университет (РТУ МИРЭА), Институт информационных технологий (ИИТ), кафедра инструментального и прикладного программного обеспечения', 54)
    text(f'(ИиППО) – {args.pages} с., 1 кн., 5 рис., 5 табл., 14 ист., 2 прил.', 55)
    markdown = (ROOT / 'report.md').read_text()
    abstract = markdown.split('# ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ', 1)[0].split('\n\n')
    keyword = next(s for s in abstract if s.startswith('Ключевые слова:'))
    text(keyword.removeprefix('Ключевые слова: ').rstrip('.'), 56)
    for chunk in abstract:
        if chunk.strip() and not chunk.startswith(('# ', 'Ключевые слова:')):
            text(chunk.strip(), 57)
    for index in [61, 62]:
        text(text_of(source_paragraphs[index]), index)
    text(f'Файл: «{args.group}_{surname}.pdf», исполнитель {author_short}', 63)
    text(f'© {signature}', 64)

    toc_position = len(body)
    toc_heading = para(source_paragraphs[52], 'СОДЕРЖАНИЕ', page_break=True)
    body.append(toc_heading)
    toc_page_file = args.output_dir / 'toc-pages.json'
    page_map = json.loads(toc_page_file.read_text()) if toc_page_file.exists() else {}
    relationships = ET.fromstring(package['word/_rels/document.xml.rels'])
    rel_namespace = 'http://schemas.openxmlformats.org/package/2006/relationships'
    figures = []
    preserved_content = []

    def table(rows, glossary=False, code=False):
        prototype = source_tables[9 if code else 2 if glossary else 4]
        result = ET.Element(q('tbl'))
        result.append(copy.deepcopy(prototype.find('w:tblPr', NS)))
        cols = len(rows[0])
        widths = [9345 // cols] * cols
        widths[-1] += 9345 - sum(widths)
        grid = ET.SubElement(result, q('tblGrid'))
        for width in widths:
            ET.SubElement(grid, q('gridCol'), {q('w'): str(width)})
        prototype_rows = prototype.findall('w:tr', NS)
        for ri, row in enumerate(rows):
            tr = ET.SubElement(result, q('tr'))
            # Keep rows intact but allow the table to continue naturally.
            trpr = ET.SubElement(tr, q('trPr'))
            ET.SubElement(trpr, q('cantSplit'))
            if ri == 0 and not glossary and not code:
                ET.SubElement(trpr, q('tblHeader'))
            cells = prototype_rows[min(ri, len(prototype_rows)-1)].findall('w:tc', NS)
            for ci, value in enumerate(row):
                origin = cells[min(ci, len(cells)-1)]
                tc = ET.SubElement(tr, q('tc'))
                tcpr = copy.deepcopy(origin.find('w:tcPr', NS))
                if tcpr is None:
                    tcpr = ET.Element(q('tcPr'))
                tcw = tcpr.find('w:tcW', NS)
                if tcw is not None:
                    tcw.set(q('w'), str(widths[ci]))
                tc.append(tcpr)
                prototype_p = origin.find('w:p', NS)
                for line in value.split('\n'):
                    tc.append(para(prototype_p, line, keep=ri == 0 and not glossary and not code))
            result.append(tr)
        body.append(result)

    lines = markdown.split('# ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ', 1)[1]
    lines = ('# ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ' + lines).splitlines()
    i = 0
    mode = ''
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith('# '):
            title = line[2:]
            mode = title
            chapter = re.match(r'^([123]) ', title)
            if chapter:
                if chapter[1] == '1':
                    heading('ОСНОВНАЯ ЧАСТЬ')
                heading(CHAPTERS[chapter[1]], 2, chapter[1] != '1')
            elif title.startswith('ПРИЛОЖЕНИЕ '):
                if 'А.' in title:
                    heading('ПРИЛОЖЕНИЯ')
                letter, topic = title.removeprefix('ПРИЛОЖЕНИЕ ').split('. ', 1)
                text(f'Приложение {letter}', 374)
                text(topic.capitalize(), 375)
            else:
                heading(title)
            if title in ['ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ', 'ПЕРЕЧЕНЬ СОКРАЩЕНИЙ И ОБОЗНАЧЕНИЙ']:
                text(text_of(source_paragraphs[73 if title.startswith('ТЕРМИНЫ') else 84]), 73)
                rows = []
                i += 1
                while i < len(lines) and not lines[i].startswith('# '):
                    value = lines[i].strip()
                    if value:
                        name, definition = value.split(' — ', 1)
                        rows.append([name, '– ' + definition.rstrip('.')])
                        preserved_content.append(value)
                    i += 1
                table(rows, glossary=True)
                continue
            i += 1
            continue
        if line.startswith('## '):
            value = line[3:]
            if value.startswith(('2.', '3.')):
                value = re.sub(r'^(\d+\.\d+) ', r'\1. ', value)
            heading(value, 3, False)
            i += 1
            continue
        if line.startswith('```'):
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i])
                i += 1
            table([['\n'.join(code)]], code=True)
            preserved_content.extend(code)
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                row = [cell.strip() for cell in lines[i].strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+', cell or '-') for cell in row):
                    rows.append(row)
                    preserved_content.extend(row)
                i += 1
            table(rows)
            continue
        image_match = re.fullmatch(r'!\[(.*?)\]\((.*?)\)', line)
        if image_match:
            caption, path = image_match.groups()
            data = (ROOT / path).read_bytes()
            index = len(figures) + 1
            rid = f'rIdTaxiFigure{index}'
            filename = f'taxi-figure-{index}.png'
            ET.SubElement(relationships, f'{{{rel_namespace}}}Relationship',
                          Id=rid, Type=R+'/image', Target='media/'+filename)
            package['word/media/'+filename] = data
            source_drawing = next(p for p in source_paragraphs[120:] if p.find('.//w:drawing', NS) is not None)
            drawing = copy.deepcopy(source_drawing)
            # Keep the retained paragraph positioning, replace only picture data.
            width_px, height_px = Image.open(ROOT / path).size
            width = min(16.4, 21.0*width_px/height_px)
            cx, cy = int(width*360000), int(width*height_px/width_px*360000)
            for blip in drawing.findall('.//a:blip', NS):
                blip.set(f'{{{R}}}embed', rid)
            for ext in drawing.findall('.//wp:extent', NS) + drawing.findall('.//a:xfrm/a:ext', NS):
                ext.set('cx', str(cx)); ext.set('cy', str(cy))
            for prop in drawing.findall('.//wp:docPr', NS):
                prop.set('id', str(9000+index)); prop.set('name', caption)
            pp = drawing.find('w:pPr', NS)
            if pp is None:
                pp = ET.Element(q('pPr')); drawing.insert(0, pp)
            ET.SubElement(pp, q('keepNext'))
            body.append(drawing)
            text(caption.replace(' — ', ' – '), 166)
            figures.append(path)
            i += 1
            continue
        if mode == 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ':
            value = re.sub(r'^\d+\.\s*', '', line)
            text(value, 336)
        elif line.startswith('Таблица '):
            p = text(line.replace(' — ', ' – '), 125)
            ET.SubElement(p.find('w:pPr', NS), q('keepNext'))
        elif line.startswith('Листинг '):
            p = text(line.replace(' — ', ' – '), 224)
            ET.SubElement(p.find('w:pPr', NS), q('keepNext'))
        else:
            text(line)
        preserved_content.append(line)
        i += 1

    # Reuse the retained TOC paragraphs (hierarchy, bold typography and tabs).
    toc_prototypes = {}
    original_document = ET.fromstring(package['word/document.xml'])
    for level, sid in [(1, '11'), (2, '21'), (3, '31')]:
        toc_prototypes[level] = next(p for p in original_document.findall('.//w:p', NS)
                                     if p.find('w:pPr/w:pStyle', NS) is not None
                                     and p.find('w:pPr/w:pStyle', NS).get(q('val')) == sid)
    insert_at = toc_position + 1
    for value, level, anchor in headings:
        p = para(toc_prototypes[level], '')
        for child in list(p):
            if child.tag != q('pPr'):
                p.remove(child)
        link = ET.SubElement(p, q('hyperlink'), {q('anchor'): anchor, q('history'): '1'})
        rp = toc_prototypes[level].find('.//w:rPr', NS)
        for contents in [value, None, str(page_map.get(value, '1'))]:
            run = ET.SubElement(link, q('r'))
            if rp is not None:
                run.append(copy.deepcopy(rp))
            if contents is None:
                ET.SubElement(run, q('tab'))
            else:
                ET.SubElement(run, q('t')).text = contents
        body.insert(insert_at, p)
        insert_at += 1
    body.append(section)

    settings = ET.fromstring(package['word/settings.xml'])
    update = settings.find('w:updateFields', NS)
    if update is None:
        update = ET.SubElement(settings, q('updateFields'))
    update.set(q('val'), 'true')
    package['word/settings.xml'] = xml(settings)
    package['word/_rels/document.xml.rels'] = xml(relationships)
    # Remove unreferenced source figures instead of embedding another coursework.
    used = set(document.xpath('//@r:embed | //@r:id', namespaces=NS))
    for relationship in list(relationships):
        if relationship.get('Type', '').endswith('/image') and relationship.get('Id') not in used:
            package.pop('word/'+relationship.get('Target'), None)
            relationships.remove(relationship)
    package['word/_rels/document.xml.rels'] = xml(relationships)
    package['word/document.xml'] = xml(document)
    core = ET.fromstring(package['docProps/core.xml'])
    for node in core:
        if ET.QName(node).localname in ['creator', 'lastModifiedBy']:
            node.text = args.author if len(author_parts) >= 3 else ''
    package['docProps/core.xml'] = xml(core)

    def save(path, selected=None):
        parts = dict(package)
        if selected is not None:
            page_document = copy.deepcopy(document)
            page_body = page_document.find('w:body', NS)
            for child in list(page_body):
                page_body.remove(child)
            for child in selected:
                clone = copy.deepcopy(child)
                for sec in clone.findall('.//w:sectPr', NS):
                    sec.getparent().remove(sec)
                page_body.append(clone)
            standalone_section = copy.deepcopy(section)
            for footer in standalone_section.findall('w:footerReference', NS):
                standalone_section.remove(footer)
            page_body.append(standalone_section)
            parts['word/document.xml'] = xml(page_document)
        with ZipFile(path, 'w', ZIP_DEFLATED) as out:
            for name, data in parts.items():
                out.writestr(name, data)

    save(args.output_dir / 'Курсовая_такси.docx')
    save(args.output_dir / 'Титульный_лист.docx', prefix[:title_count])
    save(args.output_dir / 'Лист_задания.docx', prefix[title_count:])
    # Byte-level checks for the components carrying the reference's visual system.
    for name in ['word/styles.xml', 'word/numbering.xml', 'word/footer1.xml', 'word/theme/theme1.xml']:
        with ZipFile(args.reference) as ref:
            assert package[name] == ref.read(name), name
    assert hashlib.sha256(args.reference.read_bytes()).hexdigest() == reference_hash
    extracted = text_of(document)
    if args.author != old_author:
        assert old_author not in extracted
    if surname != old_parts[0]:
        assert old_parts[0] not in extracted
    assert SUBJECT in extracted
    for value in preserved_content:
        if value and not value.startswith(('Таблица ', 'Листинг ')) and mode:
            expected = re.sub(r'^\d+\.\s*', '', value) if 'URL:' in value else value
            # Terms were moved into columns, not dropped.
            if ' — ' in expected and expected not in extracted:
                left, right = expected.split(' — ', 1)
                assert left in extracted and right.rstrip('.') in extracted, expected
            else:
                assert expected in extracted, expected
    (args.output_dir / 'headings.json').write_text(json.dumps([h[0] for h in headings], ensure_ascii=False, indent=2))
    (args.output_dir / 'format-validation.json').write_text(json.dumps({
        'reference_sha256': reference_hash, 'sections': 2,
        'preserved_package_parts': ['styles.xml', 'numbering.xml', 'footer1.xml', 'theme1.xml'],
        'content_items_verified': len(preserved_content), 'figures': figures,
        'personal_details_complete': len(author_parts) >= 3,
    }, ensure_ascii=False, indent=2))
    print('Formatted coursework and two standalone covers saved; reference and source content verified.')


if __name__ == '__main__':
    main()
