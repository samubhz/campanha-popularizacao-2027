'use strict';

/* ============================================================
   Campanha de Popularização Teatro & Dança — programação interativa
   Lê data/config.json, data/teatros.csv e data/espetaculos.csv
   ============================================================ */

const CATS = {
  'teatro-adulto':   { nome: 'Teatro adulto' },
  'teatro-infantil': { nome: 'Teatro infantil' },
  'danca':           { nome: 'Dança' },
  'stand-up':        { nome: 'Stand-up' },
  'especial':        { nome: 'Projetos especiais' },
};
const DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIA_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sim = v => /^(sim|s|1|x|true)$/i.test(String(v ?? '').trim());
const pad = n => String(n).padStart(2, '0');
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- datas (sempre strings AAAA-MM-DD; meio-dia evita problemas de fuso) ---------- */
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dt = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const somaDias = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
const rotuloDia = s => { const d = dt(s); return `${DIA_LONGO[d.getDay()]}, ${d.getDate()} ${MES[d.getMonth()]}`; };
const rotuloCurto = s => { const d = dt(s); return `${DIA_CURTO[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const horaFmt = h => { const [hh, mm] = h.split(':'); return mm === '00' ? `${+hh}h` : `${+hh}h${mm}`; };
const reais = v => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? '' : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* "hoje" vem do aparelho; ?hoje=2027-01-22 na URL serve para testar */
const HOJE = new URLSearchParams(location.search).get('hoje') || iso(new Date());

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const primeira = text.split(/\r?\n/, 1)[0];
  const delim = primeira.split(';').length > primeira.split(',').length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift().map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* ---------- sessões ----------
   "2027-01-24 16:00"                       um dia
   "2027-01-20..2027-01-25 16:00"           todos os dias do período
   "2027-01-15..2027-01-29 qui/sex 20:00"   só nos dias da semana indicados
   vários blocos separados por ; ou | ou quebra de linha                     */
function parseSessoes(str) {
  const out = [], erros = [];
  String(str || '').split(/[;|\n]/).map(s => s.trim()).filter(Boolean).forEach(parte => {
    const tk = parte.split(/\s+/);
    const m = tk[0].match(/^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/);
    const h = tk.length > 1 && tk[tk.length - 1].match(/^(\d{1,2})(?:[:h](\d{2})?)?$/i);
    if (!m || !h) { erros.push(parte); return; }
    const hora = `${pad(+h[1])}:${h[2] || '00'}`;
    const dias = tk.slice(1, -1).join(' ').split(/[,/\s]+/).filter(Boolean)
      .map(x => DIA_CURTO.findIndex(d => norm(d) === norm(x).slice(0, 3)));
    if (dias.includes(-1)) { erros.push(parte); return; }
    const fim = m[2] || m[1];
    for (let d = m[1], guarda = 0; d <= fim && guarda < 400; d = somaDias(d, 1), guarda++) {
      if (!dias.length || dias.includes(dt(d).getDay())) out.push({ d, h: hora });
    }
  });
  out.sort((a, b) => (a.d + a.h).localeCompare(b.d + b.h));
  return { sessoes: out, erros };
}

/* ---------- mapas ---------- */
const enderecoLinha = t => [t.endereco, t.bairro, t.cidade].filter(Boolean).join(', ');
function linkWaze(t) {
  if (t.lat && t.lng) return `https://waze.com/ul?ll=${t.lat},${t.lng}&navigate=yes`;
  const q = `${t.nome}, ${t.endereco.split(' - ')[0]}, ${t.cidade}`;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}
function linkMaps(t) {
  const q = t.lat && t.lng ? `${t.lat},${t.lng}` : `${t.nome}, ${t.endereco.split(' - ')[0]}, ${t.cidade}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/* ---------- estado ---------- */
let CFG, TEATROS = {}, SHOWS = [];
const PADRAO = { q: '', cat: 'todos', dia: '', teatro: '', genero: '', acess: '', view: 'espetaculos' };
const S = { ...PADRAO };

function lerHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(PADRAO)) if (p.has(k)) S[k] = p.get(k);
  return p.get('show');
}
function gravarHash(show) {
  const p = new URLSearchParams();
  for (const k of Object.keys(PADRAO)) if (S[k] && S[k] !== PADRAO[k]) p.set(k, S[k]);
  if (show) p.set('show', show);
  history.replaceState(null, '', location.pathname + location.search + (p.toString() ? '#' + p : ''));
}


/* ---------- medição própria (sem dados pessoais) ----------
   Cada ação manda uma linha para a planilha configurada em config.json > analyticsUrl. */
const SESSAO = (() => { try { let s = sessionStorage.getItem('sid'); if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('sid', s); } return s; } catch { return 'anon'; } })();
const ORIGEM = (() => {
  const p = new URLSearchParams(location.search);
  const o = p.get('origem') || p.get('o') || p.get('utm_source') || '';
  try { if (o) sessionStorage.setItem('origem', o.slice(0, 60)); return o ? o.slice(0, 60) : (sessionStorage.getItem('origem') || ''); } catch { return o; }
})();
function track(evento, d = {}) {
  try {
    if (!CFG?.analyticsUrl || /^(localhost|127\.|\[::1\])/.test(location.hostname) || new URLSearchParams(location.search).has('hoje')) return;
    const s = d.espetaculo ? SHOWS.find(x => x.id === d.espetaculo) : null;
    const corpo = JSON.stringify({
      evento, sessao: SESSAO, origem: ORIGEM, espetaculo: d.espetaculo || '', titulo: s?.titulo || '', categoria: s?.cat || '',
      local: d.local || '', extra: String(d.extra || '').slice(0, 120),
      referrer: document.referrer ? new URL(document.referrer).hostname : '', dispositivo: matchMedia('(max-width:700px)').matches ? 'celular' : 'computador',
    });
    fetch(CFG.analyticsUrl, { method: 'POST', mode: 'no-cors', body: corpo, keepalive: true });
  } catch { /* medir nunca pode quebrar o site */ }
}

/* ---------- carga ---------- */
async function carregar() {
  const get = async (u, tipo) => {
    const r = await fetch(u, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    return tipo === 'json' ? r.json() : r.text();
  };
  CFG = await get('data/config.json', 'json');
  const [tCsv, eCsv] = await Promise.all([get(CFG.csvTeatros, 'text'), get(CFG.csvEspetaculos, 'text')]);
  parseCSV(tCsv).forEach(t => { if (t.id) TEATROS[t.id] = t; });

  const ids = new Set();
  SHOWS = parseCSV(eCsv).filter(r => r.titulo).map(r => {
    const { sessoes, erros } = parseSessoes(r.sessoes);
    let id = r.id || slug(r.titulo);
    while (ids.has(id)) id += '-2';
    ids.add(id);
    const t = TEATROS[r.teatro];
    if (!t) console.warn(`[${r.titulo}] teatro "${r.teatro}" não existe em teatros.csv`);
    if (erros.length) console.warn(`[${r.titulo}] sessões inválidas:`, erros);
    if (!CATS[r.categoria]) console.warn(`[${r.titulo}] categoria inválida: "${r.categoria}"`);
    const s = {
      ...r, id, t, sessoes,
      cat: CATS[r.categoria] ? r.categoria : 'teatro-adulto',
      estreia: sim(r.estreia), libras: sim(r.libras), ad: sim(r.audiodescricao),
      criancas: sim(r.criancas_pagam), esgotado: sim(r.esgotado),
    };
    s.busca = norm([s.titulo, s.produtor, s.genero, t?.nome, t?.bairro, s.sala, s.sinopse, s.ficha, CATS[s.cat].nome].join(' '));
    return s;
  });
}

/* ---------- filtros ---------- */
const temDia = (s, dia) => s.sessoes.some(x => x.d === dia);
function passa(s, ignorarDia) {
  if (S.cat !== 'todos' && s.cat !== S.cat) return false;
  if (S.teatro && s.teatro !== S.teatro) return false;
  if (S.genero && s.genero !== S.genero) return false;
  if (S.acess && !(s.libras || s.ad)) return false;
  if (S.q && !norm(S.q).split(/\s+/).every(w => s.busca.includes(w))) return false;
  if (!ignorarDia && S.dia && !temDia(s, S.dia)) return false;
  return true;
}
const refData = () => (HOJE < CFG.inicio ? CFG.inicio : HOJE);

/* ---------- peças de HTML ---------- */
function foto(s, grande) {
  const img = s.foto ? `<img src="${esc(s.foto)}" alt="" loading="lazy">` : `<span class="inicial">${esc(s.titulo.trim()[0] || '')}</span>`;
  return img;
}
function selos(s) {
  return [
    `<span class="selo cat">${CATS[s.cat].nome}</span>`,
    s.estreia ? '<span class="selo estreia">Estreia</span>' : '',
    s.libras ? '<span class="selo">Libras</span>' : '',
    s.ad ? '<span class="selo">Audiodescrição</span>' : '',
  ].join('');
}
const precoTxt = s => {
  const v = String(s.preco ?? '').trim() === '' ? CFG.precoPadrao : s.preco;
  return /^(0|gratuito|gratis|grátis)$/i.test(String(v).trim()) ? 'Gratuito' : reais(v);
};
function precoHtml(s) {
  const p = precoTxt(s);
  const b = s.preco_bilheteria ? reais(s.preco_bilheteria) : '';
  return `<span class="preco">${p}${b ? `<s>${b} na bilheteria</s>` : ''}</span>`;
}
function botaoComprar(s, classe = 'btn primario', local = 'card') {
  if (s.esgotado) return `<span class="${classe}" aria-disabled="true">Esgotado</span>`;
  const gratis = precoTxt(s) === 'Gratuito';
  if (gratis && !s.link_ingresso) return `<button class="${classe}" data-detalhe="${esc(s.id)}">Entrada gratuita · detalhes</button>`;
  const url = s.link_ingresso || CFG.lojaUrl;
  return `<a class="${classe}" href="${esc(url)}" target="_blank" rel="noopener" data-track="comprar" data-id="${esc(s.id)}" data-local="${local}">🎟 Comprar ingresso</a>`;
}

/* ---------- vídeos e links ---------- */
function listaVideos(s) {
  return String(s.videos || '').split('|').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('::');
    return i > -1 ? { rotulo: x.slice(0, i).trim(), url: x.slice(i + 2).trim() } : { rotulo: '', url: x };
  }).filter(v => /^https?:\/\//i.test(v.url));
}
const ytId = u => (u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/) || [])[1];
const igPost = u => { const m = u.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/); return m && `https://www.instagram.com/${m[1]}/${m[2]}/embed`; };
function videoHtml(v, id) {
  const yt = ytId(v.url), ig = igPost(v.url);
  const rot = esc(v.rotulo || (yt ? 'Vídeo' : ig ? 'Vídeo no Instagram' : 'Link'));
  if (yt) return `<div class="video" data-play="yt:${yt}" data-id="${esc(id)}" role="button" tabindex="0" aria-label="Assistir: ${rot}">
      <img src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" alt="" loading="lazy"><span class="play">▶</span><span class="rot">${rot}</span></div>`;
  if (ig) return `<div class="video ig" data-play="ig:${esc(ig)}" data-id="${esc(id)}" role="button" tabindex="0"><span class="play">▶</span><span class="rot">${rot}</span></div>
      <a class="btn peq" href="${esc(v.url)}" target="_blank" rel="noopener">Abrir no Instagram</a>`;
  const insta = /instagram\.com/i.test(v.url), you = /youtube\.com|youtu\.be/i.test(v.url);
  return `<a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener">${insta ? '📷' : you ? '▶' : '🔗'} ${rot}</a>`;
}
function fichaHtml(txt) {
  const itens = String(txt || '').split('|').map(x => x.trim()).filter(Boolean);
  return `<dl class="ficha">${itens.map(it => {
    const i = it.indexOf(':');
    return i > 0 && i < 48 ? `<dt>${esc(it.slice(0, i))}</dt><dd>${esc(it.slice(i + 1).trim())}</dd>` : `<dd class="solo">${esc(it)}</dd>`;
  }).join('')}</dl>`;
}

/* ---------- compartilhar ---------- */
function linkShow(s) { return `${location.origin}${location.pathname}#show=${encodeURIComponent(s.id)}`; }
function msgWhats(s) {
  const ref = refData();
  const prox = s.sessoes.filter(x => x.d >= ref).slice(0, 3);
  const datas = (prox.length ? prox : s.sessoes.slice(0, 3)).map(x => `${rotuloCurto(x.d)} às ${horaFmt(x.h)}`).join(' · ');
  return [
    'Olha o espetáculo que eu vi na Campanha de Popularização Teatro & Dança! 🎭',
    'Bora a gente ir? Acho que você vai gostar!',
    '',
    `*${s.titulo}*`,
    s.t ? `📍 ${s.t.nome}${s.sala ? ' (' + s.sala + ')' : ''}` : '',
    datas ? `📅 ${datas}` : '',
    `🎟 ${precoTxt(s) === 'Gratuito' ? 'Entrada gratuita' : 'Ingresso a ' + precoTxt(s)}`,
    '',
    linkShow(s),
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}
const linkWhats = s => `https://wa.me/?text=${encodeURIComponent(msgWhats(s))}`;
function horasCard(s) {
  if (S.dia) {
    const hs = s.sessoes.filter(x => x.d === S.dia).map(x => `<span class="hora destaque">${horaFmt(x.h)}</span>`);
    return `<div class="horas">${hs.join('')}</div>`;
  }
  const ref = refData();
  let prox = s.sessoes.filter(x => x.d >= ref);
  const encerrado = !prox.length;
  if (encerrado) prox = s.sessoes.slice(-3);
  const mostra = prox.slice(0, 3).map(x => `<span class="hora">${rotuloCurto(x.d)} · ${horaFmt(x.h)}</span>`);
  const resto = prox.length - 3;
  return `<div class="horas">${mostra.join('')}${resto > 0 ? `<span class="hora">+${resto}</span>` : ''}</div>`;
}

function cardHtml(s) {
  const t = s.t;
  return `<article class="card" data-card="${esc(s.id)}" tabindex="0" style="--cat:var(--c-${s.cat})">
    <div class="foto">${foto(s)}<div class="selos">${selos(s)}</div></div>
    <div class="corpo">
      <h3 class="titulo">${esc(s.titulo)}</h3>
      <div class="meta">${[s.genero, s.classificacao, s.duracao].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="local">📍 ${t ? esc(t.nome) : 'Local a confirmar'}${s.sala ? ` <span class="meta">(${esc(s.sala)})</span>` : ''}</div>
      ${horasCard(s)}
      ${precoHtml(s)}
      <div class="acoes">
        ${botaoComprar(s)}
        <button class="btn" data-detalhe="${esc(s.id)}">Detalhes</button>
        ${t ? `<button class="btn" data-onde="${esc(t.id)}">Como chegar</button>` : ''}
        ${listaVideos(s).length ? `<button class="btn" data-detalhe="${esc(s.id)}" data-sec="sec-videos">▶ Vídeos</button>` : ''}
        <a class="btn whats" href="${esc(linkWhats(s))}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp" data-track="whatsapp" data-id="${esc(s.id)}" data-local="card">Compartilhar</a>
      </div>
    </div>
  </article>`;
}

/* ---------- renderização ---------- */
function renderCats() {
  const cnt = c => SHOWS.filter(s => (c === 'todos' || s.cat === c) && passaSemCat(s)).length;
  const itens = [['todos', 'Todos'], ...Object.entries(CATS).map(([k, v]) => [k, v.nome])]
    .filter(([k]) => k === 'todos' || SHOWS.some(s => s.cat === k));
  $('#cats').innerHTML = itens.map(([k, nome]) =>
    `<button class="chip" data-cat="${k}" aria-pressed="${S.cat === k}">${nome}<small>${cnt(k)}</small></button>`).join('');
}
function passaSemCat(s) {
  const cat = S.cat; S.cat = 'todos';
  const r = passa(s, false);
  S.cat = cat; return r;
}

function renderDias() {
  const base = SHOWS.filter(s => passa(s, true));
  let h = '';
  for (let d = CFG.inicio; d <= CFG.fim; d = somaDias(d, 1)) {
    const n = base.filter(s => temDia(s, d)).length;
    const dow = dt(d).getDay(), dd = dt(d);
    h += `<button class="dia${d === HOJE ? ' hoje' : ''}${n ? '' : ' vazio'}${dow === 0 || dow === 6 ? ' fds' : ''}" data-dia="${d}" aria-pressed="${S.dia === d}" aria-label="${rotuloDia(d)}, ${n} espetáculos">
      <span>${DIA_CURTO[dow]}</span><b>${dd.getDate()}</b><i>${dd.getDate() === 1 || d === CFG.inicio ? MES[dd.getMonth()] : n}</i></button>`;
  }
  $('#dias').innerHTML = h;
  $('#btn-hoje').setAttribute('aria-pressed', S.dia === HOJE);
  $('#btn-amanha').setAttribute('aria-pressed', S.dia === somaDias(HOJE, 1));
  $('#btn-todos-dias').setAttribute('aria-pressed', !S.dia);
  if (S.dia) setTimeout(() => {
    const c = $('#dias'), sel = $('[aria-pressed="true"]', c);
    if (sel) c.scrollLeft = sel.offsetLeft - (c.clientWidth - sel.offsetWidth) / 2;
  }, 50);
}

function renderSelects() {
  const ts = Object.values(TEATROS).filter(t => SHOWS.some(s => s.teatro === t.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $('#sel-teatro').innerHTML = `<option value="">Todos os teatros</option>` +
    ts.map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('');
  const gs = [...new Set(SHOWS.map(s => s.genero).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  $('#sel-genero').innerHTML = `<option value="">Todos os gêneros</option>` + gs.map(g => `<option>${esc(g)}</option>`).join('');
  $('#sel-teatro').value = S.teatro; $('#sel-genero').value = S.genero;
  $('#chk-acess').checked = !!S.acess; $('#busca').value = S.q;
  if (S.teatro || S.genero || S.acess) $('#mais').open = true;
}

function renderLista() {
  const alvo = $('#lista');
  let lista = SHOWS.filter(s => passa(s, false));
  if (S.dia) {
    const primeira = s => s.sessoes.find(x => x.d === S.dia).h;
    lista.sort((a, b) => primeira(a).localeCompare(primeira(b)) || a.titulo.localeCompare(b.titulo, 'pt'));
  } else lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt'));

  renderResumo();

  if (!lista.length) {
    alvo.innerHTML = `<p class="vazio-msg">Nenhum espetáculo encontrado com esses filtros.<br><button class="btn" id="limpar" style="margin-top:12px">Limpar filtros</button></p>`;
    return;
  }
  const grupos = Object.keys(CATS).map(k => [k, lista.filter(s => s.cat === k)]).filter(([, l]) => l.length);
  if (S.cat === 'todos' && grupos.length > 1) {
    alvo.innerHTML = grupos.map(([k, l]) => `<section class="grupo" id="g-${k}" style="--cat:var(--c-${k})">
      <h2><span>${CATS[k].nome}</span><small>${l.length} ${l.length === 1 ? 'espetáculo' : 'espetáculos'}</small></h2>
      <div class="grid">${l.map(cardHtml).join('')}</div></section>`).join('');
  } else alvo.innerHTML = `<div class="grid">${lista.map(cardHtml).join('')}</div>`;
}

/* Resumo no topo da lista: quantos espetáculos de cada categoria (no dia escolhido); clicar filtra. */
function renderResumo() {
  const base = SHOWS.filter(passaSemCat);
  const porCat = Object.keys(CATS).map(k => [k, base.filter(s => s.cat === k).length]).filter(([, n]) => n);
  const teatros = new Set(base.map(s => s.teatro).filter(Boolean)).size;
  const quando = S.dia ? `${rotuloDia(S.dia)}${S.dia === HOJE ? ' (hoje)' : ''}` : 'Toda a programação';
  const titulo = quando.charAt(0).toUpperCase() + quando.slice(1);
  const n = base.length;
  const chips = porCat.map(([k, c]) => `<button class="rc${S.cat === k ? ' ativo' : ''}" data-cat="${k}" style="--cat:var(--c-${k})" aria-pressed="${S.cat === k}"><b>${c}</b><span>${CATS[k].nome}</span></button>`).join('');
  $('#resumo').innerHTML = n ? `<div class="resumo-box">
      <div class="resumo-tit"><b>${esc(titulo)}</b><span>${n} ${n === 1 ? 'espetáculo' : 'espetáculos'} em ${teatros} ${teatros === 1 ? 'teatro' : 'teatros'}</span></div>
      <div class="resumo-chips">${chips}${S.cat !== 'todos' ? '<button class="rc todos" data-cat="todos"><b>↺</b><span>Ver todos</span></button>' : ''}</div>
    </div>` : '';
}

function renderTeatros() {
  const q = norm(S.q);
  const ts = Object.values(TEATROS).filter(t => !q || norm(`${t.nome} ${t.bairro} ${t.endereco} ${t.cidade}`).includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $('#resumo').textContent = `${ts.length} teatros e espaços`;
  $('#lista').innerHTML = `<div class="lista-teatros">${ts.map(t => {
    const n = SHOWS.filter(s => s.teatro === t.id).length;
    return `<article class="teatro">
      <h3>${esc(t.nome)}</h3>
      <p>📍 ${esc(enderecoLinha(t))}</p>
      ${t.telefone ? `<p>☎ <a href="tel:${esc(t.telefone.replace(/[^\d+]/g, ''))}">${esc(t.telefone)}</a></p>` : ''}
      ${t.lugares ? `<p>🪑 ${esc(t.lugares)} lugares</p>` : ''}
      ${t.acessibilidade ? `<p>♿ ${esc(t.acessibilidade)}</p>` : ''}
      ${t.onibus ? `<p>🚌 ${esc(t.onibus)}</p>` : ''}
      <div class="acoes">
        <a class="btn waze peq" href="${esc(linkWaze(t))}" target="_blank" rel="noopener" data-track="waze" data-extra="${esc(t.id)}" data-local="aba-teatros">Abrir no Waze</a>
        <a class="btn peq" href="${esc(linkMaps(t))}" target="_blank" rel="noopener" data-track="maps" data-extra="${esc(t.id)}" data-local="aba-teatros">Google Maps</a>
        ${n ? `<button class="btn peq" data-ver-teatro="${esc(t.id)}">${n} ${n === 1 ? 'espetáculo' : 'espetáculos'}</button>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function renderIngressos() {
  $('#resumo').textContent = '';
  const c = CFG.contato || {};
  $('#lista').innerHTML = `
    <div class="bloco"><h2>Ingressos a ${reais(CFG.precoPadrao)}</h2>
      <p>Valor promocional nos Postos Sinparc, no app e na internet.</p>
      <p><a class="btn primario" href="${esc(CFG.lojaUrl)}" target="_blank" rel="noopener">🎟 Comprar on-line</a></p></div>
    <div class="bloco"><h2>Postos de venda</h2><ul>${(CFG.postos || []).map(p =>
      `<li><b>${esc(p.nome)}</b><br>${esc(p.endereco)}<br><span class="meta">${esc(p.horario)}</span></li>`).join('')}</ul></div>
    <div class="bloco"><h2>Bom saber</h2><ul>${(CFG.regras || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
    <div class="bloco"><h2>Dúvidas</h2>
      <p>${c.telefone ? `☎ ${esc(c.telefone)}<br>` : ''}${c.whatsapp ? `WhatsApp ${esc(c.whatsapp)}<br>` : ''}${c.horario ? `<span class="meta">${esc(c.horario)}</span><br>` : ''}${c.instagram ? `Instagram ${esc(c.instagram)}` : ''}</p></div>`;
}

function render() {
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === S.view));
  const filtrosShow = S.view === 'espetaculos';
  $('#cats').hidden = $('#dias-wrap').hidden = $('#mais').hidden = !filtrosShow;
  $('#filtros').hidden = S.view === 'ingressos';
  $('#busca').placeholder = filtrosShow ? 'Buscar espetáculo, teatro, ator, gênero…' : 'Buscar teatro ou bairro…';
  if (filtrosShow) { renderCats(); renderDias(); renderLista(); }
  else if (S.view === 'teatros') renderTeatros();
  else renderIngressos();
  gravarHash($('#dlg').open ? $('#dlg').dataset.id : '');
}

/* ---------- avisos ---------- */
function aviso(msg) {
  const el = $('#aviso');
  el.hidden = !msg; el.textContent = msg || '';
}
function irParaDia(d) {
  aviso('');
  S.dia = d; render();
}
function botaoHoje() {
  if (HOJE >= CFG.inicio && HOJE <= CFG.fim) return irParaDia(HOJE);
  if (HOJE < CFG.inicio) {
    irParaDia(CFG.inicio);
    aviso(`A Campanha começa em ${rotuloDia(CFG.inicio)}. Mostrando a programação do primeiro dia.`);
  } else aviso(`A Campanha ${CFG.ano} terminou em ${rotuloDia(CFG.fim)}. Escolha outro dia na lista.`);
}

/* ---------- modais ---------- */
function abrirDlg(html, id = '') {
  const d = $('#dlg');
  d.innerHTML = `<button class="fechar" data-fechar aria-label="Fechar">×</button>${html}`;
  d.dataset.id = id;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  gravarHash(id);
}
function enderecoBox(t, showId = '') {
  return `<div class="endereco-box"><b>${esc(t.nome)}</b><br>${esc(enderecoLinha(t))}
    ${t.telefone ? `<br><span class="meta">☎ ${esc(t.telefone)}</span>` : ''}
    ${t.onibus ? `<br><span class="meta">🚌 ${esc(t.onibus)}</span>` : ''}
    ${t.acessibilidade ? `<br><span class="meta">♿ ${esc(t.acessibilidade)}</span>` : ''}</div>
    <div class="acoes">
      <a class="btn waze" href="${esc(linkWaze(t))}" target="_blank" rel="noopener" data-track="waze" data-id="${esc(showId)}" data-extra="${esc(t.id)}" data-local="${showId ? 'detalhe' : 'como-chegar'}">Abrir no Waze</a>
      <a class="btn" href="${esc(linkMaps(t))}" target="_blank" rel="noopener" data-track="maps" data-id="${esc(showId)}" data-extra="${esc(t.id)}" data-local="${showId ? 'detalhe' : 'como-chegar'}">Google Maps</a>
      <button class="btn" data-copiar="${esc(enderecoLinha(t))}">Copiar endereço</button>
    </div>`;
}
function abrirOnde(tid) {
  const t = TEATROS[tid]; if (!t) return;
  abrirDlg(`<div class="dlg-corpo"><h2 id="dlg-titulo">Como chegar</h2>${enderecoBox(t)}</div>`);
}
function abrirDetalhe(id, secao) {
  const s = SHOWS.find(x => x.id === id); if (!s) return;
  track('ver_espetaculo', { espetaculo: id, local: secao ? 'videos' : '' });
  const porDia = s.sessoes.map(x => `<div class="${x.d < HOJE ? 'passou' : ''}">${rotuloDia(x.d)} · <b>${horaFmt(x.h)}</b></div>`).join('');
  const vids = listaVideos(s).map(v => videoHtml(v, s.id));
  const extras = [s.instagram && `<a class="btn" href="https://www.instagram.com/${esc(s.instagram.replace(/^@/, ''))}/" target="_blank" rel="noopener">📷 ${esc(s.instagram)}</a>`,
    s.site && `<a class="btn" href="${/^https?:/.test(s.site) ? esc(s.site) : 'https://' + esc(s.site)}" target="_blank" rel="noopener">🔗 ${esc(s.site.replace(/^https?:\/\//, ''))}</a>`].filter(Boolean);
  abrirDlg(`
    <div class="dlg-foto" style="--cat:var(--c-${s.cat})">${s.foto ? `<img src="${esc(s.foto)}" alt="">` : ''}</div>
    <div class="dlg-corpo" style="--cat:var(--c-${s.cat})">
      <div class="selos" style="position:static">${selos(s)}</div>
      <h2 id="dlg-titulo">${esc(s.titulo)}</h2>
      <div class="meta">${[s.genero, s.classificacao, s.duracao].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="meta">Produção: ${esc(s.produtor || '—')}</div>
      <div class="acoes">${botaoComprar(s, 'btn primario', 'topo')}
        <a class="btn whats" href="${esc(linkWhats(s))}" target="_blank" rel="noopener" data-track="whatsapp" data-id="${esc(s.id)}" data-local="topo">Compartilhar no WhatsApp</a></div>
      ${s.criancas ? '<p class="meta">Todas as crianças pagam ingresso.</p>' : ''}
      ${s.sinopse ? `<h3>Sinopse</h3><p>${esc(s.sinopse)}</p>` : ''}
      ${s.ficha ? `<h3>Ficha técnica</h3>${fichaHtml(s.ficha)}` : ''}
      ${vids.length || extras.length ? `<h3 id="sec-videos">Vídeos e links</h3><div class="videos">${vids.join('')}</div>${extras.length ? `<div class="acoes">${extras.join('')}</div>` : ''}` : ''}
      <h3>Sessões</h3><div class="sessoes-lista">${porDia || '<div>Datas a confirmar</div>'}</div>
      <h3>Ingressos</h3>
      <div class="precos"><div><b>${precoTxt(s)}</b><span>${precoTxt(s) === 'Gratuito' ? 'Entrada' : 'Postos Sinparc, app e internet'}</span></div>
      ${s.preco_bilheteria ? `<div><b>${reais(s.preco_bilheteria)}</b><span>Inteira na bilheteria</span></div>` : ''}</div>
      <div class="acoes">${botaoComprar(s, 'btn primario', 'preco')}</div>
      ${s.t ? `<h3>Onde${s.sala ? ` · ${esc(s.sala)}` : ''}</h3>${enderecoBox(s.t, s.id)}` : ''}
      <div class="acoes" style="margin-top:18px">${botaoComprar(s, 'btn primario', 'fim')}
        <a class="btn whats" href="${esc(linkWhats(s))}" target="_blank" rel="noopener" data-track="whatsapp" data-id="${esc(s.id)}" data-local="fim">Compartilhar no WhatsApp</a>
        <button class="btn" data-copiarlink="${esc(s.id)}">Copiar link</button></div>
    </div>`, s.id);
  if (secao) setTimeout(() => $('#' + secao)?.scrollIntoView({ block: 'start' }), 60);
}
function tocarVideo(el) {
  track('video', { espetaculo: el.dataset.id, extra: el.dataset.play.split(':')[0] });
  const [tipo, ...r] = el.dataset.play.split(':'); const v = r.join(':');
  if (tipo === 'yt') el.outerHTML = `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0" title="Vídeo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
  else el.outerHTML = `<div class="video-frame ig"><iframe src="${v}" title="Instagram" allowfullscreen loading="lazy"></iframe></div>`;
}
async function copiarLink(id, el) {
  const s = SHOWS.find(x => x.id === id);
  track('copiar_link', { espetaculo: id });
  try { await navigator.clipboard.writeText(linkShow(s)); el.textContent = 'Link copiado!'; } catch { prompt('Copie o link:', linkShow(s)); }
}

/* ---------- eventos ---------- */
function ligar() {
  let t;
  let tb; $('#busca').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value.trim(); render(); }, 120); clearTimeout(tb); tb = setTimeout(() => { if (S.q.length >= 3) track('busca', { extra: S.q }); }, 1500); });
  $('#sel-teatro').addEventListener('change', e => { track('filtro', { local: 'teatro', extra: e.target.value }); S.teatro = e.target.value; render(); });
  $('#sel-genero').addEventListener('change', e => { track('filtro', { local: 'genero', extra: e.target.value }); S.genero = e.target.value; render(); });
  $('#chk-acess').addEventListener('change', e => { S.acess = e.target.checked ? '1' : ''; render(); });
  $('#btn-hoje').addEventListener('click', botaoHoje);
  $('#btn-amanha').addEventListener('click', () => {
    const d = somaDias(HOJE, 1);
    if (d >= CFG.inicio && d <= CFG.fim) irParaDia(d);
    else aviso(`Amanhã (${rotuloDia(d)}) está fora do período da Campanha, de ${rotuloDia(CFG.inicio)} a ${rotuloDia(CFG.fim)}.`);
  });
  $('#btn-todos-dias').addEventListener('click', () => irParaDia(''));

  const abrirCard = e => {
    const c = e.target.closest('[data-card]');
    if (c && !e.target.closest('a,button,select,input')) { abrirDetalhe(c.dataset.card); return true; }
  };
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-card]')) abrirCard(e); });
  document.addEventListener('click', e => {
    const tr = e.target.closest('[data-track]');
    if (tr) track(tr.dataset.track, { espetaculo: tr.dataset.id, local: tr.dataset.local, extra: tr.dataset.extra });
    if (abrirCard(e)) return;
    const el = e.target.closest('[data-view],[data-cat],[data-dia],[data-detalhe],[data-onde],[data-ver-teatro],[data-fechar],[data-copiar],[data-copiarlink],[data-play],#limpar');
    if (!el) return;
    const d = el.dataset;
    if (d.view) { track('aba', { extra: d.view }); S.view = d.view; aviso(''); render(); scrollTo({ top: 0 }); }
    else if (d.cat) { track('filtro', { local: 'categoria', extra: d.cat }); S.cat = (S.cat === d.cat && d.cat !== 'todos') ? 'todos' : d.cat; render(); }
    else if (d.dia) { track('filtro', { local: 'dia', extra: d.dia }); aviso(''); S.dia = S.dia === d.dia ? '' : d.dia; render(); }
    else if (d.detalhe) abrirDetalhe(d.detalhe, d.sec);
    else if (d.onde) abrirOnde(d.onde);
    else if (d.verTeatro) { Object.assign(S, PADRAO, { teatro: d.verTeatro, view: 'espetaculos' }); renderSelects(); render(); scrollTo({ top: 0 }); }
    else if ('fechar' in d) $('#dlg').close();
    else if (d.copiar) navigator.clipboard?.writeText(d.copiar).then(() => { el.textContent = 'Copiado!'; });
    else if (d.copiarlink) copiarLink(d.copiarlink, el);
    else if (d.play) tocarVideo(el);
    else if (el.id === 'limpar') { Object.assign(S, PADRAO); renderSelects(); render(); }
  });
  const dlg = $('#dlg');
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => gravarHash(''));
  addEventListener('hashchange', () => { const id = lerHash(); renderSelects(); render(); if (id) abrirDetalhe(id); });
}

/* ---------- início ---------- */
async function iniciar() {
  try {
    const showId = lerHash();
    await carregar();
    $('#aviso-exemplo').hidden = !CFG.modoExemplo;
    const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const di = dt(CFG.inicio), df = dt(CFG.fim);
    $('#hero-datas').innerHTML = di.getMonth() === df.getMonth()
      ? `${di.getDate()} a ${df.getDate()} <b>${MESES_L[df.getMonth()]}</b> · BH`
      : `${di.getDate()} <b>${MESES_L[di.getMonth()]}</b> a ${df.getDate()} <b>${MESES_L[df.getMonth()]}</b> · BH`;
    $('#rodape').innerHTML = `${esc(CFG.edicao)} ${esc(CFG.titulo)}<br>Os valores promocionais são praticados somente nos postos de venda, no app e na internet.`;
    renderSelects(); ligar(); render();
    track('visita', { extra: showId ? 'link-espetaculo' : '' });
    if (showId) abrirDetalhe(showId);
  } catch (err) {
    console.error(err);
    $('#lista').innerHTML = `<p class="vazio-msg">Não foi possível carregar a programação.<br><small>${esc(err.message)}</small><br><small>Se você abriu o arquivo direto no navegador, use um servidor local ou publique no GitHub Pages.</small></p>`;
  }
}
iniciar();
