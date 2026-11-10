// Entrar num amigo secreto pelo link de convite (/?g=<org>.<id>&c=<código>)
//  GET  /api/servicos?f=sorteio-entrar&g=..&c=..   → dados do grupo para mostrar o convite (sem login)
//  POST /api/servicos?f=sorteio-entrar  {g, c}      → a pessoa logada entra no grupo (antes do sorteio)
const LIMITE_GRATIS = 15, LIMITE_PLUS = 100;
const ok = (s) => /^[A-Za-z0-9_-]{1,80}$/.test(String(s || ''));

function partes(g) { const m = /^([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_-]{1,80})$/.exec(String(g || '')); return m ? { org: m[1], sid: m[2] } : null; }

module.exports = async (req, res) => {
  let R; try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false, erro: 'config' }); }
  const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) : (req.query || {});
  const gp = partes(body.g), cod = String(body.c || '');
  if (!gp || !ok(cod) || cod.length < 8) return res.status(400).json({ ok: false, erro: 'link' });
  try {
    const pl = ((await R.getDoc('planos/' + gp.org)) || {}).data || {};
    const plus = !!pl.plus && pl.ate && new Date(pl.ate) > new Date();
    const limite = plus ? LIMITE_PLUS : LIMITE_GRATIS;
    if (req.method === 'GET') {
      const d = await R.getDoc('sorteios/' + gp.org);
      const s = ((d && d.data.lista) || []).find((x) => String(x.id) === gp.sid);
      if (!s || s.conv !== cod) return res.status(404).json({ ok: false, erro: 'grupo' });
      const u = ((await R.getDoc('usuarios/' + gp.org)) || {}).data || {};
      const n = 1 + (s.membros || []).filter((x) => x !== gp.org).length;
      return res.status(200).json({ ok: true, nome: String(s.nome || '').slice(0, 60), org: String(u.nome || '').split(/\s+/)[0] || 'Alguém', data: s.data || '', valor: String(s.valor || '').slice(0, 30), n, cheio: n >= limite, sorteado: !!(s.sorteado || s.pares) });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user || !user.uid) return res.status(401).json({ ok: false, erro: 'login' });
    const out = await R.transacao(async (get) => {
      const d = await get('sorteios/' + gp.org);
      if (!d) return { result: { erro: 'grupo' } };
      const lista = Array.isArray(d.data.lista) ? d.data.lista : [];
      const i = lista.findIndex((x) => String(x.id) === gp.sid);
      const s = lista[i];
      if (!s || s.conv !== cod) return { result: { erro: 'grupo' } };
      if (s.sorteado || s.pares) return { result: { erro: 'sorteado' } };
      if (user.uid === gp.org || (s.membros || []).includes(user.uid)) return { result: { ja: true } };
      const n = 1 + (s.membros || []).filter((x) => x !== gp.org).length;
      if (n >= limite) return { result: { erro: 'cheio' } };
      const agora = new Date().toISOString();
      const novo = { ...s, membros: [...(s.membros || []), user.uid], entrou: { ...(s.entrou || {}), [user.uid]: agora } };
      const nova = lista.slice(); nova[i] = novo;
      return { writes: [R.W.set('sorteios/' + gp.org, { ...d.data, lista: nova }, { pre: d })], result: { entrou: true } };
    });
    if (out.erro) return res.status(out.erro === 'grupo' ? 404 : 409).json({ ok: false, erro: out.erro });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    console.error('sorteio-entrar', e && e.message);
    return res.status(500).json({ ok: false, erro: 'falha' });
  }
};
