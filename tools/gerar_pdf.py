#!/usr/bin/env python3
"""Gera o programa da campanha em PDF (formato de celular, 9:16) a partir dos mesmos
arquivos do site: data/config.json, data/teatros.csv e data/espetaculos.csv.

Uso:  python3 tools/gerar_pdf.py [saida.pdf]
Requer o Google Chrome instalado (usado em modo "headless" para imprimir o PDF).
"""
import csv, datetime as dt, html, json, math, os, re, subprocess, sys, tempfile, urllib.parse

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'programa-campanha-2027.pdf')
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')

CATS = {
    'teatro-adulto': ('Teatro adulto', '#c4692f'),
    'teatro-infantil': ('Teatro infantil', '#2f9a72'),
    'danca': ('Dança', '#8a5cc4'),
    'stand-up': ('Stand-up', '#d9a441'),
    'especial': ('Projetos especiais', '#c0463f'),
}
DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']  # weekday(): seg=0
MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
DIA_LONGO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
e = lambda s: html.escape(str(s or ''), quote=True)


def norm(s):
    import unicodedata
    return unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()


def ler_csv(p):
    with open(p, encoding='utf-8-sig', newline='') as f:
        txt = f.read()
    delim = ';' if txt.split('\n', 1)[0].count(';') > txt.split('\n', 1)[0].count(',') else ','
    import io
    return [{k.strip().lower(): (v or '').strip() for k, v in r.items()} for r in csv.DictReader(io.StringIO(txt), delimiter=delim)]


def parse_sessoes(txt):
    out = []
    for parte in re.split(r'[;|\n]', txt or ''):
        tk = parte.strip().split()
        if len(tk) < 2:
            continue
        m = re.match(r'^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$', tk[0])
        h = re.match(r'^(\d{1,2})(?:[:h](\d{2})?)?$', tk[-1], re.I)
        if not m or not h:
            continue
        hora = f'{int(h.group(1)):02d}:{h.group(2) or "00"}'
        dias = [x for x in re.split(r'[,/\s]+', ' '.join(tk[1:-1])) if x]
        idx = []
        for x in dias:
            n = norm(x)[:3]
            ok = [i for i, d in enumerate(DIA) if norm(d) == n]
            if ok:
                idx.append(ok[0])
        a = dt.date.fromisoformat(m.group(1)); b = dt.date.fromisoformat(m.group(2) or m.group(1))
        d = a
        while d <= b:
            if not idx or d.weekday() in idx:
                out.append((d, hora))
            d += dt.timedelta(days=1)
    return sorted(out)


hfmt = lambda h: (f'{int(h[:2])}h' if h[3:] == '00' else f'{int(h[:2])}h{h[3:]}')
rotulo_curto = lambda d: f'{DIA[d.weekday()]} {d.day:02d}/{d.month:02d}'
rotulo_longo = lambda d: f'{DIA_LONGO[d.weekday()]}, {d.day} {MES[d.month - 1]}'


def reais(v):
    try:
        n = float(str(v).replace('R$', '').replace('.', '').replace(',', '.').strip())
    except ValueError:
        return ''
    return 'R$ ' + f'{n:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def endereco_linha(t):
    return ', '.join(x for x in [t.get('endereco'), t.get('bairro'), t.get('cidade')] if x)


def q_local(t):
    return f"{t['nome']}, {t['endereco'].split(' - ')[0]}, {t['cidade']}"


def waze(t):
    if t.get('lat') and t.get('lng'):
        return f"https://waze.com/ul?ll={t['lat']},{t['lng']}&navigate=yes"
    return 'https://waze.com/ul?q=' + urllib.parse.quote(q_local(t)) + '&navigate=yes'


def maps(t):
    q = f"{t['lat']},{t['lng']}" if t.get('lat') and t.get('lng') else q_local(t)
    return 'https://www.google.com/maps/search/?api=1&query=' + urllib.parse.quote(q)


def foto_src(p):
    if not p:
        return ''
    if re.match(r'^https?://', p):
        return p
    f = os.path.join(RAIZ, p)
    return 'file://' + urllib.parse.quote(f) if os.path.exists(f) else ''


def videos(s):
    out = []
    for x in (s.get('videos') or '').split('|'):
        x = x.strip()
        if not x:
            continue
        rot, url = (x.split('::', 1) + [''])[:2] if '::' in x else ('', x)
        if re.match(r'^https?://', url.strip()):
            out.append((rot.strip(), url.strip()))
    return out


# ---------------- dados ----------------
CFG = json.load(open(os.path.join(RAIZ, 'data/config.json'), encoding='utf-8'))
TEATROS = {t['id']: t for t in ler_csv(os.path.join(RAIZ, 'data/teatros.csv')) if t.get('id')}
SHOWS = []
for r in ler_csv(os.path.join(RAIZ, 'data/espetaculos.csv')):
    if not r.get('titulo'):
        continue
    r['id'] = r.get('id') or re.sub(r'[^a-z0-9]+', '-', norm(r['titulo'])).strip('-')
    r['cat'] = r['categoria'] if r.get('categoria') in CATS else 'teatro-adulto'
    r['t'] = TEATROS.get(r.get('teatro'))
    r['sess'] = parse_sessoes(r.get('sessoes'))
    SHOWS.append(r)
SHOWS.sort(key=lambda s: (list(CATS).index(s['cat']), norm(s['titulo'])))
sim = lambda v: str(v or '').strip().lower() in ('sim', 's', '1', 'x', 'true')
ini = dt.date.fromisoformat(CFG['inicio']); fim = dt.date.fromisoformat(CFG['fim'])
PERIODO = f'{ini.day} {MES[ini.month - 1].upper()} A {fim.day} {MES[fim.month - 1].upper()} {fim.year}'
SITE = CFG.get('siteUrl', 'https://samubhz.github.io/campanha-popularizacao-2027/')
LOJA = CFG.get('lojaUrl', 'https://www.vaaoteatromg.com.br')
HOJE = dt.date.today().strftime('%d/%m/%Y')
FORCAR = set(filter(None, os.environ.get('FORCAR_FICHA', '').split(',')))
APERTAR = set(filter(None, os.environ.get('APERTAR', '').split(',')))

CAPA = 'file://' + urllib.parse.quote(os.path.join(RAIZ, 'assets/capa-pdf.jpg'))
LOGO = 'file://' + urllib.parse.quote(os.path.join(RAIZ, 'assets/logo-campanha.webp'))

CSS = """
@page { size: 1080px 1920px; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { background: #1b0f0a }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #f4e9d8; -webkit-print-color-adjust: exact; print-color-adjust: exact }
a { color: inherit; text-decoration: none }
.pg { width: 1080px; height: 1920px; position: relative; overflow: hidden; page-break-after: always; break-after: page; display: flex; flex-direction: column; background: radial-gradient(ellipse at 50% 0, #3d2217 0, #1b0f0a 62%) }
.cond { font-family: 'Avenir Next Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif; font-weight: 800; letter-spacing: .01em }
.topo { height: 110px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 44px; background: var(--c); color: #fff }
.topo .cat { font-size: 40px; text-transform: uppercase; font-weight: 800; letter-spacing: .08em }
.menu { display: inline-block; padding: 14px 30px; border-radius: 40px; background: rgba(0,0,0,.35); color: #fff; font-size: 30px; font-weight: 700 }
.foto { height: 430px; flex: none; position: relative; background: linear-gradient(135deg, var(--c), #1b0f0a 120%); display: flex; align-items: center; justify-content: center }
.foto img { width: 100%; height: 100%; object-fit: cover }
.foto .ini { font-size: 220px; opacity: .3; font-weight: 800 }
.selos { position: absolute; left: 28px; bottom: 22px; display: flex; gap: 12px }
.selo { background: rgba(0,0,0,.78); color: #fff; font-size: 26px; font-weight: 700; padding: 8px 20px; border-radius: 30px }
.selo.e { background: #d9a441; color: #2a1810 }
.corpo { padding: 26px 48px 0; flex: 1; display: flex; flex-direction: column; min-height: 0 }
h1 { font-size: 66px; line-height: 1.04; margin-bottom: 8px }
.meta { font-size: 29px; color: #bba68d; margin-bottom: 20px }
.btns { display: flex; gap: 16px; margin-bottom: 18px }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 22px 30px; border-radius: 20px; font-size: 33px; font-weight: 800; background: #38211a; border: 2px solid #4a2e22; color: #f4e9d8; text-align: center }
.btn.c { background: #d9a441; border-color: #d9a441; color: #2a1810; flex: 1; font-size: 40px }
.btn.w { background: #25d366; border-color: #25d366; color: #05301a }
.btn.z { background: #33ccff; border-color: #33ccff; color: #05303f }
.btn.p { padding: 16px 26px; font-size: 28px }
.sec { margin-bottom: 14px }
.lab { font-size: 24px; letter-spacing: .12em; text-transform: uppercase; color: #d9a441; font-weight: 800; margin-bottom: 7px }
.local { font-size: 32px; font-weight: 700; line-height: 1.2 }
.end { font-size: 26px; color: #bba68d; margin: 2px 0 12px }
.row { display: flex; gap: 14px; flex-wrap: wrap }
.chip { background: #38211a; border: 2px solid #4a2e22; border-radius: 14px; padding: 8px 18px; font-size: 27px }
.preco { display: flex; align-items: baseline; gap: 22px }
.preco b { font-size: 60px; color: #d9a441 }
.preco span { font-size: 27px; color: #bba68d }
.txt { font-size: var(--fs, 30px); line-height: 1.34; color: #eadfcd }
.ficha { font-size: var(--ff, 25px); line-height: 1.32; color: #d8ccb8 }
.ficha b { color: #d9a441; font-weight: 700 }
.rod { height: 108px; flex: none; margin-top: auto; display: flex; align-items: center; justify-content: space-between; padding: 0 44px; border-top: 2px solid #4a2e22; background: #140a06; font-size: 28px; color: #bba68d }
.rod a { padding: 14px 24px; border-radius: 30px; background: #2a1810; color: #f4e9d8; font-weight: 700 }
.cap { padding: 60px 56px 0; flex: 1 }
.cap h2 { font-size: 78px; line-height: 1; margin-bottom: 14px }
.cap p { font-size: 32px; color: #bba68d; margin-bottom: 30px }
.item { display: block; padding: 20px 26px; margin-bottom: 14px; border-radius: 18px; background: #2a1810; border-left: 12px solid var(--c); font-size: 34px; line-height: 1.15 }
.item small { display: block; font-size: 25px; color: #bba68d; margin-top: 6px; font-weight: 400 }
.big { display: block; padding: 34px 40px; margin-bottom: 20px; border-radius: 26px; background: var(--c); color: #fff; font-size: 52px; line-height: 1.05 }
.big small { display: block; font-size: 28px; opacity: .85; margin-top: 8px; font-weight: 500 }
.capa { background: #000 url(CAPA) center/cover no-repeat }
.capa .go { position: absolute; left: 70px; right: 70px; bottom: 90px; text-align: center; padding: 36px; border-radius: 30px; background: #d9a441; color: #2a1810; font-size: 50px; font-weight: 800; box-shadow: 0 10px 40px rgba(0,0,0,.6) }
.capa .data { position: absolute; left: 0; right: 0; bottom: 250px; text-align: center; font-size: 34px; color: #fff; text-shadow: 0 2px 10px #000 }
.hero { padding: 70px 50px 10px; text-align: center }
.hero img { width: 100% }
.t-card { padding: 22px 26px; margin-bottom: 14px; border-radius: 18px; background: #2a1810 }
.t-card h4 { font-size: 34px; margin-bottom: 4px }
.t-card p { font-size: 25px; color: #bba68d; line-height: 1.25 }
.t-card .row { margin-top: 10px }
ul.lista { list-style: none; font-size: 30px; line-height: 1.3; color: #eadfcd }
ul.lista li { margin-bottom: 18px; padding-left: 36px; position: relative }
ul.lista li::before { content: '✦'; position: absolute; left: 0; color: #d9a441 }
"""


def pagina(conteudo, cor='#d9a441', cls=''):
    return f'<section class="pg {cls}" style="--c:{cor}">{conteudo}</section>'


def rodape(prev=None, nxt=None, cat=None):
    esq = f'<a href="#{prev}">‹ anterior</a>' if prev else '<span></span>'
    dir_ = f'<a href="#{nxt}">próximo ›</a>' if nxt else '<span></span>'
    meio = f'<a href="#cat-{cat}">☰ lista</a>' if cat else ''
    return f'<div class="rod">{esq}{meio}{dir_}</div>'


def topo(rotulo):
    return f'<div class="topo"><span class="cat cond">{e(rotulo)}</span><a class="menu" href="#menu">☰ MENU</a></div>'


def tam(txt, base, minimo, largura, linhas_max, lh):
    """maior fonte (px) em que o texto cabe em linhas_max linhas."""
    fs = base
    while fs > minimo:
        cpl = largura / (fs * 0.5)
        if math.ceil(len(txt) / cpl) * fs * lh <= linhas_max:
            return fs
        fs -= 1
    return minimo


def ficha_html(txt):
    itens = [x.strip() for x in (txt or '').split('|') if x.strip()]
    partes = []
    for it in itens:
        if ':' in it and it.index(':') < 48:
            k, v = it.split(':', 1)
            partes.append(f'<b>{e(k)}:</b> {e(v.strip())}')
        else:
            partes.append(e(it))
    return ' &nbsp;·&nbsp; '.join(partes)


def pagina_show(i, s, prev, nxt):
    nome, cor = CATS[s['cat']]
    t = s['t']
    f = foto_src(s.get('foto'))
    img = f'<img src="{e(f)}">' if f else f'<span class="ini cond">{e(s["titulo"][:1])}</span>'
    selos = ''.join([
        '<span class="selo e">Estreia</span>' if sim(s.get('estreia')) else '',
        '<span class="selo">Libras</span>' if sim(s.get('libras')) else '',
        '<span class="selo">Audiodescrição</span>' if sim(s.get('audiodescricao')) else '',
    ])
    meta = ' · '.join(x for x in [s.get('genero'), s.get('classificacao'), s.get('duracao')] if x)
    prod = f"Produção: {s['produtor']}" if s.get('produtor') else ''
    preco_raw = s.get('preco') or str(CFG.get('precoPadrao', ''))
    gratis = norm(preco_raw).strip() in ('0', 'gratuito', 'gratis')
    preco = 'Gratuito' if gratis else reais(preco_raw)
    bil = reais(s['preco_bilheteria']) if s.get('preco_bilheteria') else ''
    link = s.get('link_ingresso') or LOJA
    esg = sim(s.get('esgotado'))
    comprar = ('<span class="btn c" style="opacity:.5">ESGOTADO</span>' if esg else
               ('' if gratis and not s.get('link_ingresso') else f'<a class="btn c" href="{e(link)}">🎟 COMPRAR INGRESSO</a>'))
    if gratis and not s.get('link_ingresso') and not esg:
        comprar = '<span class="btn c">ENTRADA GRATUITA</span>'
    msg = (f"Olha o espetáculo que eu vi na Campanha de Popularização Teatro & Dança! 🎭\nBora a gente ir? Acho que você vai gostar!\n\n*{s['titulo']}*\n"
           + (f"📍 {t['nome']}\n" if t else '') + f"\n{SITE}#show={s['id']}")
    whats = f'<a class="btn w" href="https://wa.me/?text={urllib.parse.quote(msg)}">Compartilhar</a>'

    # sessões
    sess = s['sess']
    cap = 8 if s['id'] in APERTAR else 24
    chips = ''.join(f'<span class="chip">{rotulo_curto(d)} · <b>{hfmt(h)}</b></span>' for d, h in sess[:cap])
    if len(sess) > cap:
        chips += f'<span class="chip">+{len(sess) - cap} no site</span>'
    if not sess:
        chips = '<span class="chip">Datas a confirmar</span>'

    local = ''
    if t:
        sala = f' <span style="font-weight:400;color:#bba68d">· {e(s["sala"])}</span>' if s.get('sala') else ''
        local = (f'<div class="sec"><div class="lab">Onde</div><div class="local">📍 {e(t["nome"])}{sala}</div>'
                 f'<div class="end">{e(endereco_linha(t))}</div>'
                 f'<div class="row"><a class="btn z p" href="{e(waze(t))}">Abrir no Waze</a>'
                 f'<a class="btn p" href="{e(maps(t))}">Google Maps</a></div></div>')

    # links / vídeos
    vids = videos(s)
    links = []
    for rot, url in vids[:(2 if s['id'] in APERTAR else 4)]:
        yt = re.search(r'youtu', url)
        ig = re.search(r'instagram', url)
        nome_l = rot or ('Vídeo' if yt else 'Instagram' if ig else 'Link')
        links.append(f'<a class="btn p" href="{e(url)}">{"▶" if yt else "📷" if ig else "🔗"} {e(nome_l[:30])}</a>')
    if s.get('instagram') and not any('instagram' in u for _, u in vids):
        links.append(f'<a class="btn p" href="https://www.instagram.com/{e(s["instagram"].lstrip("@"))}/">📷 {e(s["instagram"])}</a>')
    if s.get('site'):
        u = s['site'] if s['site'].startswith('http') else 'https://' + s['site']
        links.append(f'<a class="btn p" href="{e(u)}">🔗 site</a>')
    links_html = f'<div class="sec"><div class="lab">Vídeos e links</div><div class="row">{"".join(links)}</div></div>' if links else ''

    # sinopse + ficha: cabem juntas? senão a ficha vai para uma 2ª página
    sin = s.get('sinopse') or ''
    fic = ficha_html(s.get('ficha'))
    fic_txt = re.sub('<[^>]+>', '', fic)
    reserva = 330 + (0 if t else -250) + (0 if links else -110) + (120 if len(chips) > 700 else 0)
    espaco = 1920 - 110 - 430 - 108 - 700 - reserva + 330  # altura restante estimada p/ sinopse+ficha
    espaco = max(espaco, 380)
    cabe = False
    forcar = s['id'] in FORCAR
    for fs, ff in ((30, 25), (28, 24), (27, 23), (26, 22)):
        h = (math.ceil(len(sin) / (952 / (fs * .5))) * fs * 1.34 + 30 + 40 + math.ceil(len(fic_txt) / (952 / (ff * .5))) * ff * 1.32)
        if h <= espaco:
            cabe = True
            break
    cabe = cabe and not forcar
    sid = f'show-{s["id"]}'
    corpo_sin = f'<div class="sec"><div class="lab">Sinopse</div><div class="txt" style="--fs:{fs if cabe else tam(sin, 30, 21, 952, 260 if s['id'] in APERTAR else 380, 1.34)}px">{e(sin)}</div></div>' if sin else ''
    if cabe:
        corpo_fic = f'<div class="sec"><div class="lab">Ficha técnica</div><div class="ficha" style="--ff:{ff}px">{fic}</div></div>' if fic else ''
    else:
        corpo_fic = f'<div class="sec"><a class="btn p" href="#{sid}-ficha">📋 Ficha técnica completa ›</a></div>' if fic else ''

    pg1 = pagina(
        f'{topo(nome)}<div class="foto">{img}<div class="selos">{selos}</div></div>'
        f'<div class="corpo"><h1 class="cond" style="font-size:{66 if len(s["titulo"]) < 36 else 52}px">{e(s["titulo"])}</h1>'
        f'<div class="meta">{e(meta)}{" · " if meta and prod else ""}{e(prod)}</div>'
        f'<div class="btns">{comprar}{whats}</div>{local}'
        f'<div class="sec"><div class="lab">Sessões</div><div class="row">{chips}</div></div>'
        f'<div class="sec preco"><b class="cond">{e(preco)}</b><span>{"promocional · postos, app e internet" if not gratis else ""}'
        f'{" · bilheteria " + e(bil) if bil else ""}</span></div>'
        f'{corpo_sin}{corpo_fic}{links_html}</div>{rodape(prev, nxt, s["cat"])}',
        cor).replace('<section class="pg ', f'<section id="{sid}" class="pg ', 1)
    if cabe or not fic:
        return pg1
    ff2 = tam(fic_txt, 34, 24, 952, 1330, 1.32)
    pg2 = pagina(
        f'{topo(nome)}<div class="corpo" style="padding-top:44px"><div class="lab">Ficha técnica</div>'
        f'<h1 class="cond" style="font-size:58px">{e(s["titulo"])}</h1><div class="meta">{e(prod)}</div>'
        f'<div class="ficha" style="--ff:{ff2}px">{fic}</div>'
        f'<div class="btns" style="margin-top:34px">{comprar}<a class="btn" href="#{sid}">‹ Voltar</a></div></div>'
        f'{rodape(prev, nxt, s["cat"])}', cor).replace('<section class="pg ', f'<section id="{sid}-ficha" class="pg ', 1)
    return pg1 + pg2


def paginas_lista(titulo, subtitulo, itens, cor, id_base, por=11):
    """itens: lista de html, `por` por página."""
    n = max(1, math.ceil(len(itens) / por))
    out = []
    for k in range(n):
        bloco = itens[k * por:(k + 1) * por]
        cab = f'<h2 class="cond">{e(titulo)}</h2><p>{e(subtitulo)}{f" · página {k + 1}/{n}" if n > 1 else ""}</p>'
        out.append(pagina(f'{topo(titulo)}<div class="cap">{cab}{"".join(bloco)}</div>'
                          f'<div class="rod"><a href="#menu">☰ menu</a><span></span><span></span></div>', cor).replace(
            '<section class="pg ', f'<section id="{id_base}{"" if k == 0 else "-" + str(k + 1)}" class="pg ', 1))
    return out


# ---------------- montagem ----------------
pags = []
pags.append('<section class="pg capa"><a class="go cond" href="#menu">ABRIR A PROGRAMAÇÃO ›</a></section>')

# menu
por_cat = {c: [s for s in SHOWS if s['cat'] == c] for c in CATS}
botoes = ''.join(f'<a class="big cond" style="--c:{cor}" href="#cat-{c}">{e(nome)}<small>{len(por_cat[c])} espetáculos</small></a>'
                 for c, (nome, cor) in CATS.items() if por_cat[c])
botoes += '<a class="big cond" style="--c:#4a2e22" href="#ingressos">Ingressos e onde comprar<small>valores, postos de venda e regras</small></a>'
botoes += '<a class="big cond" style="--c:#4a2e22" href="#teatros">Teatros e endereços<small>com rota no Waze</small></a>'
pags.append(pagina(
    f'<div class="hero"><img src="{LOGO}"></div><div class="cap" style="padding-top:30px"><div class="lab" style="font-size:28px">Menu</div>'
    f'<p style="margin-bottom:24px">Toque na categoria para ver os espetáculos. De {ini.day} de {MESES_LONGOS[ini.month - 1]} a {fim.day} de {MESES_LONGOS[fim.month - 1]} de {fim.year}.</p>{botoes}'
    f'<p style="font-size:24px;margin-top:10px">Programação atualizada em {HOJE}. Para a versão mais recente: '
    f'<a href="{e(SITE)}" style="color:#d9a441">{e(SITE.replace("https://", ""))}</a></p></div>').replace('<section class="pg ', '<section id="menu" class="pg ', 1))

# categorias + espetáculos
ordem = [s for c in CATS for s in por_cat[c]]
ids = [f'show-{s["id"]}' for s in ordem]
for c, (nome, cor) in CATS.items():
    lista = por_cat[c]
    if not lista:
        continue
    itens = []
    for s in lista:
        t = s['t']
        prox = f'{rotulo_curto(s["sess"][0][0])} · {hfmt(s["sess"][0][1])}' if s['sess'] else ''
        itens.append(f'<a class="item" style="--c:{cor}" href="#show-{e(s["id"])}"><b class="cond">{e(s["titulo"])}</b>'
                     f'<small>{e(t["nome"] if t else "")}{" · " if t and prox else ""}{e(prox)}{" · +" + str(len(s["sess"]) - 1) + " sessões" if len(s["sess"]) > 1 else ""}</small></a>')
    pags += paginas_lista(nome, f'{len(lista)} espetáculos', itens, cor, f'cat-{c}')
    for s in lista:
        i = ordem.index(s)
        pags.append(pagina_show(i, s, ids[i - 1] if i > 0 else None, ids[i + 1] if i + 1 < len(ids) else None))

# ingressos
regras = ''.join(f'<li>{e(r)}</li>' for r in CFG.get('regras', []))
postos = ''.join(f'<div class="t-card"><h4 class="cond">{e(p["nome"])}</h4><p>{e(p["endereco"])}<br>{e(p["horario"])}</p></div>' for p in CFG.get('postos', []))
ct = CFG.get('contato', {})
pags.append(pagina(
    f'{topo("Ingressos")}<div class="cap"><h2 class="cond">Ingressos a {e(reais(CFG.get("precoPadrao", "")))}</h2>'
    f'<p>Valor promocional nos postos Sinparc, no app e na internet.</p>'
    f'<a class="btn c" style="display:flex;margin-bottom:34px" href="{e(LOJA)}">🎟 COMPRAR ON-LINE</a>'
    f'<div class="lab">Postos de venda</div>{postos}<div class="lab" style="margin-top:26px">Bom saber</div><ul class="lista" style="font-size:27px">{regras}</ul>'
    f'<p style="margin-top:20px;font-size:27px">☎ {e(ct.get("telefone", ""))} · WhatsApp {e(ct.get("whatsapp", ""))}<br>{e(ct.get("horario", ""))}</p></div>'
    f'<div class="rod"><a href="#menu">☰ menu</a><span></span><span></span></div>').replace('<section class="pg ', '<section id="ingressos" class="pg ', 1))

# teatros
tcards = []
for t in sorted(TEATROS.values(), key=lambda x: norm(x['nome'])):
    extra = ' · '.join(x for x in [f"{t['lugares']} lugares" if t.get('lugares') else '', t.get('acessibilidade', '')] if x)
    tcards.append(f'<div class="t-card"><h4 class="cond">{e(t["nome"])}</h4><p>📍 {e(endereco_linha(t))}<br>{e(extra)}</p>'
                  f'<div class="row"><a class="btn z p" href="{e(waze(t))}">Abrir no Waze</a><a class="btn p" href="{e(maps(t))}">Google Maps</a></div></div>')
pags += paginas_lista('Teatros e endereços', f'{len(tcards)} espaços', tcards, '#4a2e22', 'teatros', por=6)

# contracapa
pags.append(pagina(
    f'<div class="hero" style="padding-top:260px"><img src="{LOGO}"></div><div class="cap" style="text-align:center"><p style="font-size:38px;color:#f4e9d8">Vem pro teatro!</p>'
    f'<a class="btn c" style="display:flex;margin:40px 0" href="{e(SITE)}">Ver a programação atualizada no site</a>'
    f'<p style="font-size:27px">Realização: Sinparc MG · {e(LOJA.replace("https://", ""))}<br>Programa gerado em {HOJE}. Datas, preços e horários podem mudar: confira no site.</p></div>'
    f'<div class="rod"><a href="#menu">☰ menu</a><span></span><span></span></div>'))

doc = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Programação — 52ª Campanha de Popularização Teatro &amp; Dança {fim.year}</title><style>{CSS.replace("CAPA", CAPA)}</style></head><body>{"".join(pags)}</body></html>'
CHECK = """<script>addEventListener('load',()=>{document.querySelectorAll('.pg').forEach(p=>{const c=p.querySelector('.corpo,.cap');if(c&&c.scrollHeight>c.clientHeight+2)p.setAttribute('data-estouro',c.scrollHeight-c.clientHeight)})})</script>"""
tmp = os.path.join(tempfile.gettempdir(), 'programa-campanha.html')
open(tmp, 'w', encoding='utf-8').write(doc.replace('</body>', CHECK + '</body>'))
dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--virtual-time-budget=30000', '--dump-dom', 'file://' + tmp], capture_output=True, text=True).stdout
ids_est = set(re.findall(r'<section id="([^"]+)"[^>]*data-estouro', dom))
est_show = {i[5:] for i in ids_est if i.startswith('show-') and not i.endswith('-ficha')}
novos, apertar = est_show - FORCAR, (est_show & FORCAR) - APERTAR
if (novos or apertar) and int(os.environ.get('ITER', '0')) < 4:
    env = dict(os.environ, FORCAR_FICHA=','.join(FORCAR | novos), APERTAR=','.join(APERTAR | apertar), ITER=str(int(os.environ.get('ITER', '0')) + 1))
    os.execve(sys.executable, [sys.executable] + sys.argv, env)
if ids_est:
    print('ATENÇÃO: conteúdo cortado nas páginas:', ', '.join(sorted(ids_est)))
open(tmp, 'w', encoding='utf-8').write(doc)
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
                '--virtual-time-budget=30000', f'--print-to-pdf={SAIDA}', 'file://' + tmp], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(f'{len(SHOWS)} espetáculos, {len(pags)} blocos -> {SAIDA} ({os.path.getsize(SAIDA) / 1e6:.1f} MB)')
