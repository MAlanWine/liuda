"""Rebuild fixed auth-screen font subsets; requires fonttools and upstream OTFs."""
from pathlib import Path
import hashlib
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
out = root / 'assets/fonts'
out.mkdir(exist_ok=True)
ui_text = ''.join((root / p).read_text() for p in [
    'src/components/AuthLanding.tsx', 'src/state/entry.tsx',
])
ui_text += ''.join(chr(i) for i in range(32, 127))
ui_text = ''.join(sorted(set(c for c in ui_text if ord(c) >= 32)))
for filename, family, text in [
    ('serif-medium.otf', 'LiudaDisplay', '留答 '),
    ('sans-regular.otf', 'LiudaInterfaceV2', ui_text),
    ('sans-medium.otf', 'LiudaInterfaceMedium', ui_text),
]:
    original = source / filename
    font = TTFont(original)
    missing = {ord(c) for c in text} - set(font.getBestCmap())
    if missing:
        raise ValueError(f'{filename}: missing glyphs {missing}')
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    replacements = {1: family, 2: 'Regular', 3: family + '-AuthSubset-v1',
                    4: family, 6: family, 16: family, 17: 'Regular'}
    for record in font['name'].names:
        if record.nameID in replacements:
            record.string = replacements[record.nameID].encode(record.getEncoding())
    cff = font['CFF '].cff
    cff.fontNames = [family]
    cff.topDictIndex[0].FamilyName = family
    cff.topDictIndex[0].FullName = family
    target = out / (family + '.otf')
    font.save(target)
    check = TTFont(target)
    assert {ord(c) for c in text} <= set(check.getBestCmap())
    print(f'{target.name}: {target.stat().st_size} bytes; {len(text)} characters; source SHA256 {hashlib.sha256(original.read_bytes()).hexdigest()}')
