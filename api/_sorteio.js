// Amigo secreto comum (família e amigos). Chamado por /api/servicos?f=sorteio
// O sorteio é feito aqui no servidor e o resultado de cada pessoa vai para sorteiores/{org}_{id}_{pessoa},
// que só a própria pessoa consegue ler. Nem o organizador vê quem tirou quem.
//  acao "sortear": o organizador sorteia um amigo secreto dele
//  acao "migrar" : converte sorteios antigos (feitos no aparelho) para o novo formato.
//                  O organizador migra os dele; o administrador migra todos.
const ADMIN = String(process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();
const APP = process.env.APP_URL || 'https://presente-certo-zeta.vercel.app';

// Avisa no celular (quem ativou os avisos) que o sorteio foi feito. Não diz quem tirou quem.
async function avisarSorteio(R, org, s, ids) {
  try {
    const P = require('./_push'); await P.preparar();
    const quem = String((((await R.getDoc('usuarios/' + org)) || {}).data || {}).nome || 'O organizador').split(' ')[0];
    for (const uid of ids) {
      if (uid === org) continue;
      const pu = await R.getDoc('push/' + uid); const subs = ((pu || {}).data || {}).subs || [];
      if (!subs.length) continue;
      const r = await P.enviar(subs, { title: `🎁 Saiu o sorteio do amigo secreto ${String(s.nome || '').slice(0, 50)}!`, body: `${quem} fez o sorteio. Abra o PresenteCerto para ver quem você tirou.`, url: APP + '/?t=sorteio', tag: 'sorteio-' + s.id });
      if (r.vivos.length !== subs.length) await R.commit([R.W.set('push/' + uid, { subs: r.vivos }, { merge: true })]);
    }
  } catch (e) { /* o sorteio já foi gravado; aviso é só um extra */ }
}

function sortear(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const p = {}; a.forEach((g, i) => { p[g] = a[(i + 1) % a.length]; }); return p;
}
function decPares(s) {
  try { return JSON.parse(decodeURIComponent(escape(Buffer.from(String(s), 'base64').toString('binary')))); } catch (e) { return null; }
}
const chave = (org, sid, de) => `${org}_${sid}_${de}`.replace(/\//g, '_');

// Grava os resultados e tira os pares do documento público do organizador
async function aplicar(R, org, transforma) {
  return R.transacao(async (get) => {
    const d = await get('sorteios/' + org);
    if (!d) return { result: { n: 0 } };
    const lista = Array.isArray(d.data.lista) ? d.data.lista : [];
    const writes = []; let n = 0; let mudou = false;
    const nova = lista.map((s) => {
      const pares = transforma(s);
      if (!pares) return s;
      mudou = true; n++;
      Object.entries(pares).forEach(([de, para]) => {
        if (!de || !para) return;
        writes.push(R.W.set('sorteiores/' + chave(org, s.id, de), { de, tirou: para, org, sid: String(s.id), em: new Date() }));
      });
      const { pares: _x, ...resto } = s;
      return { ...resto, sorteado: true, sorteadoEm: s.sorteadoEm || new Date().toISOString() };
    });
    if (!mudou) return { result: { n: 0 } };
    writes.push(R.W.set('sorteios/' + org, { ...d.data, lista: nova }, { pre: d }));
    return { writes, result: { n } };
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R;
  try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false, erro: 'config' }); }
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user) return res.status(401).json({ ok: false, erro: 'login' });
    const body = req.body || {};
    const acao = String(body.acao || '');
    const ehAdmin = user.verificado && user.email === ADMIN;

    if (acao === 'sortear') {
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ ok: false, erro: 'id' });
      let poucos = false, achou = false, alvo = null, idsSorteio = [];
      const out = await aplicar(R, user.uid, (s) => {
        if (String(s.id) !== id) return null;
        achou = true;
        if (s.pares || s.sorteado) return null;
        const ids = [...new Set([user.uid, ...(s.membros || []).filter((x) => x && x !== user.uid)])];
        if (ids.length < 3) { poucos = true; return null; }
        alvo = s; idsSorteio = ids;
        return sortear(ids);
      });
      if (!achou) return res.status(404).json({ ok: false, erro: 'nao_encontrado' });
      if (poucos) return res.status(400).json({ ok: false, erro: 'poucos' });
      if (out.n > 0 && alvo) await avisarSorteio(R, user.uid, alvo, idsSorteio);
      return res.status(200).json({ ok: true, ja: out.n === 0 });
    }

    if (acao === 'migrar') {
      const orgs = ehAdmin && body.todos ? (await R.listDocs('sorteios')).map((d) => d.id) : [user.uid];
      let n = 0;
      for (const org of orgs) {
        const r = await aplicar(R, org, (s) => (s.pares ? decPares(s.pares) : null));
        n += r.n;
      }
      return res.status(200).json({ ok: true, n });
    }

    return res.status(400).json({ ok: false, erro: 'acao' });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'falha', detalhe: String(e && e.message).slice(0, 160) });
  }
};
