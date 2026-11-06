# Verify a built poem page against the book PDF.
# 1) pdftotext -layout BOOK.pdf book.txt   2) npm run build
# 3) python3 scripts/books/verify.py dist/writing/<slug>/index.html book.txt <first page> <last page>
# Page numbers (lines like "!71") are page furniture and are excluded. Prints the number of differences.
# Compare a built poem page with the book's text (pdftotext -layout, page numbers excluded).
import sys, re, html
page_html, txt, first, last = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
pages = open(txt, encoding='utf-8').read().split('\f')
FOOT = re.compile(r'^\s*!\d+\s*$')
book = []
for n in range(first, last + 1):
    pl = [l.rstrip() for l in pages[n - 1].split('\n') if not FOOT.match(l)]
    while pl and not pl[-1]: pl.pop()
    book += pl
book = book[next(i for i, l in enumerate(book) if re.fullmatch(r"\(\d{4}\)", l.strip())) + 2:]
while book and not book[-1]: book.pop()
page = open(page_html, encoding='utf-8').read()
poem = re.search(r'<div class="poem[^"]*"[^>]*>(.*?)</div>', page, re.S).group(1)
site = []
for i, st in enumerate(re.findall(r'<p class="stanza">(.*?)</p>', poem, re.S)):
    if i: site.append('')
    site += [html.unescape(l).replace('\xa0', '') for l in re.findall(r'<span class="line">(.*?)</span>', st, re.S)]
bad = sum(a != b for a, b in zip(site, book)) + abs(len(site) - len(book))
print(f'{page_html.split("/")[-2]}: book {len(book)} lines, site {len(site)} lines, differences {bad}')
