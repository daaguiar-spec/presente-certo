// Ofertas automáticas da Shopee (API de afiliados). Usa SHOPEE_APP_ID e SHOPEE_SECRET da Vercel.
// Busca produtos pelas palavras-chave escolhidas no Painel e grava em ofertasauto/shopee.
const crypto = require('crypto');
const URL_API = 'https://open-api.affiliate.shopee.com.br/graphql';

async function chamar(query, variables) {
  const app = process.env.SHOPEE_APP_ID, sec = process.env.SHOPEE_SECRET;
  if (!app || !sec) throw new Error('Faltam SHOPEE_APP_ID e SHOPEE_SECRET na Vercel');
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha256').update(app + ts + payload + sec).digest('hex');
  const r = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${app}, Timestamp=${ts}, Signature=${sig}` }, body: payload });
  const j = await r.json().catch(() => ({}));
  if (j.errors && j.errors.length) throw new Error('Shopee: ' + String(j.errors[0].message || JSON.stringify(j.errors[0])).slice(0, 200));
  if (!r.ok) throw new Error('Shopee respondeu ' + r.status);
  return j.data || {};
}

const Q = `query($kw:String,$sort:Int,$limit:Int,$page:Int){productOfferV2(keyword:$kw,sortType:$sort,limit:$limit,page:$page){nodes{itemId shopId productName imageUrl priceMin priceMax commissionRate sales offerLink ratingStar priceDiscountRate}}}`;

async function buscar(palavra, limite) {
  const d = await chamar(Q, { kw: palavra, sort: 2, limit: Math.min(Math.max(limite, 5), 30), page: 1 });
  return ((d.productOfferV2 || {}).nodes || []).filter((n) => n && n.offerLink && n.productName);
}

// atualiza e grava; retorna {ok, n, erro}
async function atualizar(R, cfg) {
  const conf = (cfg && cfg.shopeeAuto) || {};
  if (!conf.ligado) return { ok: true, n: 0, desligado: true };
  const palavras = (Array.isArray(conf.palavras) ? conf.palavras : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 6);
  if (!palavras.length) palavras.push('presente');
  const qtd = Math.min(Math.max(+conf.qtd || 8, 1), 12);
  const ocultos = new Set((conf.ocultos || []).map(String));
  const vistos = new Set(), escolhidos = [];
  const porPalavra = Math.ceil(qtd / palavras.length) + 2;
  for (const p of palavras) {
    const itens = await buscar(p, 20);
    itens.sort((a, b) => (+b.commissionRate || 0) * (+b.sales || 1) - (+a.commissionRate || 0) * (+a.sales || 1));
    let k = 0;
    for (const n of itens) {
      const id = String(n.itemId);
      if (vistos.has(id) || ocultos.has(id) || (+n.ratingStar && +n.ratingStar < 4)) continue;
      vistos.add(id); escolhidos.push({ n, p }); if (++k >= porPalavra) break;
    }
  }
  // intercala as palavras para variar
  const lista = [];
  for (let i = 0; lista.length < qtd && i < 50; i++) for (const p of palavras) { const ix = escolhidos.findIndex((e) => e.p === p); if (ix >= 0 && lista.length < qtd) lista.push(escolhidos.splice(ix, 1)[0].n); }
  const ofertas = lista.map((n) => ({
    id: 'sh' + n.itemId, itemId: String(n.itemId), titulo: String(n.productName).slice(0, 90), imagem: String(n.imageUrl || ''),
    preco: n.priceMin ? Number(n.priceMin).toFixed(2).replace('.', ',') : '', link: String(n.offerLink), loja: 'Shopee',
    comissao: n.commissionRate ? Math.round(+n.commissionRate * 1000) / 10 : 0
  }));
  const c = await R.commit([R.W.set('ofertasauto/shopee', { lista: ofertas, em: new Date(), palavras })]);
  if (c && c.ok === false) throw new Error('Não consegui gravar as ofertas');
  return { ok: true, n: ofertas.length };
}
module.exports = { atualizar };
