// Função da Vercel: lê a página de um produto e devolve o nome e a foto, para cadastrar
// "Ofertas da semana" mais rápido no Painel. Não busca preço (o preço é opcional e digitado à mão).
// Só o administrador pode usar.
// Variáveis de ambiente na Vercel (as mesmas que já existem):
//   FIREBASE_API_KEY -> o mesmo apiKey do firebase-config.js
//   ADMIN_EMAIL      -> opcional; padrão daaguiar@gmail.com

const ADMIN = (process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();
const LIMITE_BYTES = 2_500_000;

const LOJAS = [
  [/(^|\.)amazon\.com\.br$|(^|\.)amzn\.to$|(^|\.)amazon\.com$/, 'Amazon'],
  [/(^|\.)mercadolivre\.com\.br$|(^|\.)mercadolibre\.com$/, 'Mercado Livre'],
  [/(^|\.)magazineluiza\.com\.br$|(^|\.)magazinevoce\.com\.br$|(^|\.)magalu\.com$/, 'Magalu'],
  [/(^|\.)netshoes\.com\.br$/, 'Netshoes'],
  [/(^|\.)centauro\.com\.br$/, 'Centauro'],
  [/(^|\.)shopee\.com\.br$/, 'Shopee'],
  [/(^|\.)americanas\.com\.br$/, 'Americanas'],
  [/(^|\.)casasbahia\.com\.br$/, 'Casas Bahia'],
  [/(^|\.)pontofrio\.com\.br$/, 'Ponto'],
  [/(^|\.)kabum\.com\.br$/, 'KaBuM!'],
  [/(^|\.)aliexpress\.com$/, 'AliExpress'],
  [/(^|\.)dafiti\.com\.br$/, 'Dafiti'],
  [/(^|\.)renner\.com\.br$|(^|\.)lojasrenner\.com\.br$/, 'Renner'],
  [/(^|\.)riachuelo\.com\.br$/, 'Riachuelo'],
  [/(^|\.)boticario\.com\.br$/, 'O Boticário'],
  [/(^|\.)natura\.com\.br$/, 'Natura'],
  [/(^|\.)sephora\.com\.br$/, 'Sephora'],
  [/(^|\.)leroymerlin\.com\.br$/, 'Leroy Merlin'],
  [/(^|\.)tokstok\.com\.br$/, 'Tok&Stok'],
  [/(^|\.)fastshop\.com\.br$/, 'Fast Shop']
];
function nomeLoja(host) {
  host = String(host || '').toLowerCase().replace(/^www\./, '');
  for (const [re, n] of LOJAS) if (re.test(host)) return n;
  const base = host.split('.')[0] || '';
  return base ? base[0].toUpperCase() + base.slice(1) : '';
}

// Bloqueia endereços internos (para a função não virar uma porta para a rede da Vercel)
function enderecoPermitido(u) {
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[')) return false; // só nomes, não IPs
  return true;
}

const ent = s => String(s || '')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const limpa = s => ent(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function meta(html, nomes) {
  for (const n of nomes) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${n}["'][^>]*>`, 'i');
    const tag = (html.match(re1) || [])[0];
    if (tag) { const c = (tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i) || [])[1]; if (c && c.trim()) return ent(c.trim()); }
  }
  return '';
}

function jsonLdProduto(html) {
  const blocos = [...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const achar = (o) => {
    if (!o || typeof o !== 'object') return null;
    if (Array.isArray(o)) { for (const x of o) { const r = achar(x); if (r) return r; } return null; }
    const t = [].concat(o['@type'] || []).map(String);
    if (t.some(x => /^(Product|ProductGroup)$/i.test(x))) return o;
    if (o['@graph']) return achar(o['@graph']);
    if (o.mainEntity) return achar(o.mainEntity);
    return null;
  };
  for (const b of blocos) {
    try { const p = achar(JSON.parse(b.trim())); if (p) return p; } catch (e) { /* bloco inválido: ignora */ }
  }
  return null;
}
function primeiraImagem(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return primeiraImagem(img[0]);
  return img.url || img.contentUrl || '';
}

function extrair(html, urlFinal) {
  const u = new URL(urlFinal);
  let titulo = '', imagem = '';
  const p = jsonLdProduto(html);
  if (p) { titulo = limpa(p.name); imagem = primeiraImagem(p.image); }
  // Amazon: título e foto principal da página
  if (/amazon\./i.test(u.hostname)) {
    if (!titulo) titulo = limpa((html.match(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
    if (!imagem) {
      const tag = (html.match(/<img[^>]+id=["'](?:landingImage|imgBlkFront|main-image)["'][^>]*>/i) || [])[0] || '';
      imagem = ent((tag.match(/data-old-hires=["']([^"']+)["']/i) || [])[1] || '');
      if (!imagem) { const dyn = (tag.match(/data-a-dynamic-image=["']([^"']+)["']/i) || [])[1]; if (dyn) { try { imagem = Object.keys(JSON.parse(ent(dyn)))[0] || ''; } catch (e) {} } }
      if (!imagem) imagem = ent((tag.match(/\ssrc=["']([^"']+)["']/i) || [])[1] || '');
      if (!imagem) imagem = ((html.match(/"hiRes"\s*:\s*"(https:[^"]+)"/) || [])[1]) || '';
    }
  }
  if (!titulo) titulo = meta(html, ['og:title', 'twitter:title', 'name']);
  if (!imagem) imagem = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image']);
  if (!titulo) titulo = limpa((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  // tira o nome da loja do fim do título ("Produto | Loja", "Produto - Amazon.com.br")
  titulo = titulo.replace(/\s*[|\-–—:]\s*(Amazon\.com\.br|Amazon|Mercado Livre|Magalu|Magazine Luiza|Netshoes|Centauro|Shopee|Americanas|Casas Bahia|KaBuM!?)[^|]*$/i, '').trim();
  if (imagem) { try { imagem = new URL(imagem, urlFinal).toString(); } catch (e) { imagem = ''; } }
  if (!/^https:\/\//i.test(imagem)) imagem = '';
  return { titulo: titulo.slice(0, 120), imagem: imagem.slice(0, 1000), loja: nomeLoja(u.hostname) };
}

async function baixar(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    let atual = new URL(url);
    for (let i = 0; i < 6; i++) { // segue redirecionamentos conferindo cada endereço
      if (!enderecoPermitido(atual)) throw new Error('endereço não permitido');
      const r = await fetch(atual, {
        redirect: 'manual', signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9'
        }
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { atual = new URL(r.headers.get('location'), atual); continue; }
      if (!r.ok) throw new Error('a loja respondeu ' + r.status);
      const reader = r.body.getReader(); let n = 0; const partes = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; n += value.length; partes.push(value); if (n > LIMITE_BYTES) { try { reader.cancel(); } catch (e) {} break; } }
      return { html: Buffer.concat(partes.map(p => Buffer.from(p))).toString('utf8'), urlFinal: atual.toString() };
    }
    throw new Error('redirecionamentos demais');
  } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });
  const fbKey = process.env.FIREBASE_API_KEY;
  if (!fbKey) return res.status(500).json({ erro: 'Falta FIREBASE_API_KEY na Vercel.' });

  // 1. Só o administrador
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let email = '', verificado = false;
  try {
    const v = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    const u = ((await v.json()).users || [])[0] || {};
    email = String(u.email || '').toLowerCase(); verificado = !!u.emailVerified;
  } catch (e) { /* sem login */ }
  if (!token || email !== ADMIN || !verificado) return res.status(403).json({ erro: 'Só o administrador pode usar.' });

  // 2. Lê a página
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  let url = String((body && body.url) || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  let alvo; try { alvo = new URL(url); } catch (e) { return res.status(400).json({ erro: 'Link inválido.' }); }
  if (!enderecoPermitido(alvo)) return res.status(400).json({ erro: 'Link inválido.' });
  try {
    const { html, urlFinal } = await baixar(alvo.toString());
    const d = extrair(html, urlFinal);
    if (!d.titulo && !d.imagem) return res.status(200).json({ ok: false, loja: d.loja, erro: 'Não encontramos o nome nem a foto nesta página. Preencha à mão.' });
    return res.status(200).json({ ok: true, ...d });
  } catch (e) {
    return res.status(200).json({ ok: false, loja: nomeLoja(alvo.hostname), erro: 'A loja não deixou ler a página agora. Preencha à mão.' });
  }
};
module.exports.extrair = extrair; // usado nos testes
