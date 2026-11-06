# Set a writing entry's text from the book PDF (pdftotext -layout output), excluding page numbers.
# python3 scripts/books/apply.py book.txt src/content/writing/<slug>.md <first page> <last page> "<title as printed>" "(<year>)"
# Replace a writing entry's text with the book's text (pdftotext -layout), excluding page numbers.
import sys, re
txt, md, first, last, title, year = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6]
pages = open(txt, encoding='utf-8').read().split('\f')
FOOT = re.compile(r'^\s*!\d+\s*$')
lines = []
for n in range(first, last + 1):
    pl = [l.rstrip() for l in pages[n - 1].split('\n') if not FOOT.match(l)]
    while pl and not pl[-1]: pl.pop()
    lines += pl
assert lines[0] == title and lines[1] == year and lines[2] == '', lines[:3]
body = lines[3:]
while body and not body[-1]: body.pop()
src = open(md, encoding='utf-8').read()
head, _, _ = src.partition('---\n')[2].partition('---\n')
open(md, 'w', encoding='utf-8').write('---\n' + head + '---\n' + '\n'.join(body) + '\n')
print(f'{md}: {len([l for l in body if l])} text lines, {body.count("")} stanza/paragraph breaks')
