# Programação interativa — Campanha de Popularização Teatro & Dança

Site estático (HTML + CSS + JavaScript, sem instalação nem build). Toda a programação vem de três arquivos em `data/`, então para atualizar o site basta editar planilhas.

## Como funciona

| Arquivo | O que tem |
|---|---|
| `data/config.json` | Datas da campanha, preço padrão, link da loja, postos de venda, regras. Troque `"modoExemplo"` para `false` quando for ao ar. |
| `data/teatros.csv` | Endereço, telefone, lugares, acessibilidade e ônibus de cada teatro (já preenchido com o programa 2026; confira para 2027). |
| `data/espetaculos.csv` | Um espetáculo por linha. **Cada espetáculo tem um só teatro.** |
| `fotos/` | Fotos dos espetáculos (coluna `foto` = `fotos/nome.jpg`). Sem foto, o card mostra a cor da categoria. |

## Preenchendo `espetaculos.csv`

Abra no Google Planilhas ou Excel, preencha e exporte como CSV (UTF-8). Aceita vírgula ou ponto e vírgula.

| Coluna | Como preencher |
|---|---|
| `id` | Identificador curto e único, sem espaço (`a-cunhada`). Vira o link de compartilhamento. Se deixar vazio, é gerado do título. |
| `categoria` | `teatro-adulto`, `teatro-infantil`, `danca`, `stand-up` ou `especial` |
| `teatro` | O `id` do teatro em `teatros.csv` (`palacio-das-artes`). |
| `sala` | Opcional: `Grande Teatro`, `Sala Juvenal Dias`… |
| `sessoes` | Datas e horários, veja abaixo. |
| `preco` | Preço promocional. Vazio = usa `precoPadrao` do `config.json`. |
| `preco_bilheteria` | Inteira na bilheteria (opcional). |
| `link_ingresso` | **Link direto de compra deste espetáculo.** Vazio = botão leva para a loja geral. |
| `estreia`, `libras`, `audiodescricao`, `criancas_pagam`, `esgotado` | `sim` ou vazio |
| `ficha` | Ficha técnica completa. Itens separados por `\|`, cada um como `Função: nomes` (`Autor: X \| Direção: Y \| Elenco: A, B, C`). Vira uma tabela no site. |
| `videos` | Vídeos e links, separados por `\|`: `Teaser::https://youtube.com/watch?v=ID \| Instagram::https://instagram.com/reel/ID`. Links do YouTube e de posts/reels do Instagram tocam dentro do site; qualquer outro vira botão. |
| `instagram`, `site` | Perfil do grupo (`@perfil`) e site: viram botões em "Vídeos e links". |

### Formato de `sessoes`

```
2027-01-24 16:00                          um dia
2027-01-20..2027-01-25 16:00              todos os dias do período
2027-01-15..2027-01-29 qui/sex 20:00      só quintas e sextas
2027-01-22 20:30; 2027-01-29 20:30        vários blocos separados por ;
```

Dias da semana: `dom seg ter qua qui sex sab`. Horas: `20:00`, `20h30` ou `20h`.

## Testar no seu computador

Abrir o `index.html` com duplo clique **não funciona** (o navegador bloqueia a leitura dos CSV). Rode um servidor local:

```bash
cd site
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Para simular "hoje", use `?hoje=2027-01-22` no endereço.

Se aparecer algo estranho (teatro inexistente, sessão mal escrita, categoria errada), o aviso fica no console do navegador (F12).

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie o conteúdo da pasta `site/` para a raiz dele.
2. No repositório: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Em alguns minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Para atualizar a programação: edite os CSV no GitHub (botão **Add file → Upload files**, substituindo `data/espetaculos.csv`) e o site atualiza sozinho.

## Funções já prontas

- Busca sem acento por título, produtor, teatro, bairro, gênero, sinopse e elenco
- Filtros por categoria, teatro, gênero e acessibilidade (Libras/audiodescrição)
- **Hoje / Amanhã / faixa de dias** com a contagem de espetáculos de cada dia, ordenados por horário
- Botão **Comprar ingresso** por espetáculo (usa `link_ingresso`)
- **Abrir no Waze**, Google Maps e copiar endereço; para o pino exato, preencha `lat` e `lng` em `teatros.csv`
- Aba **Teatros** (endereços, telefone, lugares, ônibus) e aba **Ingressos** (postos, regras, contato)
- Botão **Compartilhar** no WhatsApp com mensagem pronta (nome, teatro, datas, preço e link do espetáculo)
- Ficha técnica completa em tabela e vídeos/links incorporados no detalhe de cada espetáculo

## Métricas do site

O site registra, sem dados pessoais, cada visita, espetáculo aberto, clique em Comprar, compartilhamento no WhatsApp, vídeo tocado, uso do Waze/Maps, busca e filtro. Os eventos vão para a planilha **Campanha 2027 - Metricas do site** (Google Planilhas), pelo endereço em `data/config.json` > `analyticsUrl`. As abas `resumo_geral`, `resumo_espetaculos` e `resumo_por_dia` somam tudo automaticamente.

Para saber de qual ponto da cidade veio cada visita, use um código por QR Code: `https://.../?origem=ponto-paulista`.

Nada é registrado ao testar no computador (`localhost`) nem com `?hoje=` no endereço.
