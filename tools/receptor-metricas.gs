// Receptor das métricas da Campanha de Popularização Teatro & Dança.
// Recebe um evento por vez do site e grava uma linha na aba "eventos".
// Não guarda nome, e-mail, IP ou qualquer dado pessoal.

var ABA = 'eventos';
var CABECALHO = ['data_hora', 'sessao', 'origem', 'evento', 'espetaculo', 'titulo', 'categoria', 'local', 'extra', 'referrer', 'dispositivo'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ABA) || ss.insertSheet(ABA);
    if (sh.getLastRow() === 0) sh.appendRow(CABECALHO);
    var cut = function (v) { return String(v == null ? '' : v).slice(0, 150); };
    sh.appendRow([
      new Date(), cut(d.sessao), cut(d.origem), cut(d.evento), cut(d.espetaculo), cut(d.titulo),
      cut(d.categoria), cut(d.local), cut(d.extra), cut(d.referrer), cut(d.dispositivo)
    ]);
  } catch (err) {
    // medir nunca pode atrapalhar o site
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  return ContentService.createTextOutput('ok');
}

function doGet() {
  return ContentService.createTextOutput('receptor ativo');
}

// Rode UMA vez no editor (menu Executar > configurar) para criar as abas de resumo.
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetLocale('en_US'); // as fórmulas abaixo estão em inglês
  var ev = ss.getSheetByName(ABA) || ss.insertSheet(ABA);
  if (ev.getLastRow() === 0) ev.appendRow(CABECALHO);
  ev.setFrozenRows(1);

  // Resumo por espetáculo
  var r = ss.getSheetByName('resumo_espetaculos') || ss.insertSheet('resumo_espetaculos');
  r.clear();
  r.getRange('A1:I1').setValues([['Espetáculo', 'Visualizações', 'Cliques em Comprar', 'WhatsApp', 'Copiar link', 'Vídeos tocados', 'Waze', 'Google Maps', 'Cliques Comprar / Visualizações']]);
  r.getRange('A2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(eventos!F2:F, eventos!F2:F<>""))),"")');
  var col = { B: 'ver_espetaculo', C: 'comprar', D: 'whatsapp', E: 'copiar_link', F: 'video', G: 'waze', H: 'maps' };
  Object.keys(col).forEach(function (c) {
    r.getRange(c + '2').setFormula('=ARRAYFORMULA(IF($A2:$A="","",COUNTIFS(eventos!$F:$F,$A2:$A,eventos!$D:$D,"' + col[c] + '")))');
  });
  r.getRange('I2').setFormula('=ARRAYFORMULA(IF($A2:$A="","",IF(B2:B=0,0,C2:C/B2:B)))');
  r.getRange('I2:I').setNumberFormat('0%');
  r.setFrozenRows(1); r.getRange('A1:I1').setFontWeight('bold');

  // Resumo geral e por origem (QR Code)
  var g = ss.getSheetByName('resumo_geral') || ss.insertSheet('resumo_geral');
  g.clear();
  g.getRange('A1:B1').setValues([['Indicador', 'Total']]);
  g.getRange('A2:A9').setValues([['Visitas (sessões)'], ['Espetáculos abertos'], ['Cliques em Comprar'], ['Compartilhamentos no WhatsApp'], ['Links copiados'], ['Vídeos tocados'], ['Abriram o Waze/Maps'], ['Buscas']]);
  g.getRange('B2').setFormula('=COUNTA(UNIQUE(FILTER(eventos!B2:B, eventos!B2:B<>"")))');
  g.getRange('B3').setFormula('=COUNTIF(eventos!D:D,"ver_espetaculo")');
  g.getRange('B4').setFormula('=COUNTIF(eventos!D:D,"comprar")');
  g.getRange('B5').setFormula('=COUNTIF(eventos!D:D,"whatsapp")');
  g.getRange('B6').setFormula('=COUNTIF(eventos!D:D,"copiar_link")');
  g.getRange('B7').setFormula('=COUNTIF(eventos!D:D,"video")');
  g.getRange('B8').setFormula('=COUNTIF(eventos!D:D,"waze")+COUNTIF(eventos!D:D,"maps")');
  g.getRange('B9').setFormula('=COUNTIF(eventos!D:D,"busca")');
  g.getRange('D1:F1').setValues([['Origem (QR Code)', 'Visitas', 'Cliques em Comprar']]);
  g.getRange('D2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(eventos!C2:C, eventos!C2:C<>""))),"")');
  g.getRange('E2').setFormula('=ARRAYFORMULA(IF(D2:D="","",COUNTIFS(eventos!$C:$C,D2:D,eventos!$D:$D,"visita")))');
  g.getRange('F2').setFormula('=ARRAYFORMULA(IF(D2:D="","",COUNTIFS(eventos!$C:$C,D2:D,eventos!$D:$D,"comprar")))');
  g.getRange('A1:B1').setFontWeight('bold'); g.getRange('D1:F1').setFontWeight('bold');
  g.setColumnWidth(1, 240); g.setColumnWidth(4, 200);

  // Por dia
  var d = ss.getSheetByName('resumo_por_dia') || ss.insertSheet('resumo_por_dia');
  d.clear();
  d.getRange('A1:D1').setValues([['Dia', 'Visitas', 'Espetáculos abertos', 'Cliques em Comprar']]);
  d.getRange('A2').setFormula('=IFERROR(SORT(UNIQUE(ARRAYFORMULA(TEXT(FILTER(eventos!A2:A, eventos!A2:A<>""),"yyyy-mm-dd")))),"")');
  d.getRange('B2').setFormula('=ARRAYFORMULA(IF(A2:A="","",COUNTIFS(eventos!$A:$A,">="&DATEVALUE(A2:A),eventos!$A:$A,"<"&DATEVALUE(A2:A)+1,eventos!$D:$D,"visita")))');
  d.getRange('C2').setFormula('=ARRAYFORMULA(IF(A2:A="","",COUNTIFS(eventos!$A:$A,">="&DATEVALUE(A2:A),eventos!$A:$A,"<"&DATEVALUE(A2:A)+1,eventos!$D:$D,"ver_espetaculo")))');
  d.getRange('D2').setFormula('=ARRAYFORMULA(IF(A2:A="","",COUNTIFS(eventos!$A:$A,">="&DATEVALUE(A2:A),eventos!$A:$A,"<"&DATEVALUE(A2:A)+1,eventos!$D:$D,"comprar")))');
  d.getRange('A1:D1').setFontWeight('bold');

  ss.setActiveSheet(g);
  ss.moveActiveSheet(1);
}
