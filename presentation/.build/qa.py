from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import re, json, hashlib
from pypdf import PdfReader

root = Path('S:/2026/dust/presentation')
deck = root/'deliverables/Retail_Operations_Platform_Presentation.pptx'
pdf = root/'deliverables/Retail_Operations_Platform_Presentation.pdf'
ns = {'a':'http://schemas.openxmlformats.org/drawingml/2006/main', 'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
reader = PdfReader(pdf)
normalize = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
checks=[]
all_xml_text=''
native_shapes=0
with ZipFile(deck) as z:
    assert len(reader.pages)==18
    for i,page in enumerate(reader.pages,1):
        xml = ET.fromstring(z.read(f'ppt/slides/slide{i}.xml'))
        texts=[''.join(n.itertext()) for n in xml.findall('.//a:t',ns)]
        actual=page.extract_text() or ''
        norm=normalize(actual)
        missing=[t for t in texts if normalize(t) and normalize(t) not in norm]
        assert not missing, (i,missing)
        assert len(actual)>180
        assert abs(float(page.mediabox.width)/float(page.mediabox.height)-16/9)<.001
        shapes=len(xml.findall('.//p:sp',ns)); native_shapes+=shapes
        checks.append({'slide':i,'editable_shapes':shapes,'pdf_text_chars':len(actual),'missing_text_runs':len(missing)})
    for name in z.namelist():
        if name.endswith('.xml') and ('slides/' in name or 'notesSlides/' in name):
            all_xml_text+=' '.join(ET.fromstring(z.read(name)).itertext())+'\n'
    assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{30,}|ghp_[0-9A-Za-z]{25,}|10\.20\.10\.13|localhost:8000',all_xml_text)
    assert sum(1 for n in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml',n))==18
    native_tables=sum(z.read(f'ppt/slides/slide{i}.xml').count(b'<a:tbl>') for i in range(1,19))
    assert native_tables==3
report={'passed':True,'slides':18,'pdf_pages':18,'native_shapes':native_shapes,'native_tables':native_tables,'all_native_text_present_in_pdf':True,'sensitive_pattern_scan':'no findings','pptx_sha256':hashlib.sha256(deck.read_bytes()).hexdigest(),'slides_checked':checks}
(root/'.build/qa-final.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='slides_checked'}))
