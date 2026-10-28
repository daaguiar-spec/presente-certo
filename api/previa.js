// Prévia pública do perfil para quem recebe o link e ainda não tem conta.
// Chamado por GET /api/servicos?f=previa&u=<@ ou id>
// Só mostra perfis ABERTOS de ADULTOS que LIGARAM a prévia (campo previa=true).
// Perfil fechado ou prévia desligada: só o primeiro nome e o aviso.
// Menor de idade ou idade desconhecida: não mostra nada da pessoa.
// Nunca devolve ano de nascimento, idade, cidade, e-mail nem quem reservou o quê.
const LIMITE_POR_MIN = 30;
const usos = new Map();

function idadeDe(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || '')); if (!m) return null;
  const h = new Date(); let a = h.getFullYear() - +m[1];
  if (h.getMonth() + 1 < +m[2] || (h.getMonth() + 1 === +m[2] && h.getDate() < +m[3])) a--;
  return a;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const agora = Date.now(); const l = (usos.get(ip) || []).filter((t) => agora - t < 60e3);
  if (l.length >= LIMITE_POR_MIN) return res.status(429).json({ ok: false });
  l.push(agora); usos.set(ip, l);

  const q = String((req.query && req.query.u) || '').replace(/^@/, '').trim();
  if (!q || q.length > 60 || !/^[A-Za-z0-9._-]+$/.test(q)) return res.status(400).json({ ok: false });
  let R; try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false }); }
  try {
    let uid = '', handle = '';
    const un = await R.getDoc('usernames/' + q.toLowerCase());
    if (un && un.data.uid) { uid = String(un.data.uid); handle = q.toLowerCase(); }
    else uid = q;
    const p = ((await R.getDoc('profiles/' + uid)) || {}).data;
    if (!p) return res.status(404).json({ ok: false });
    if (!handle && p.usuario) handle = String(p.usuario);
    const u = ((await R.getDoc('usuarios/' + uid)) || {}).data || {};
    const nomeCompleto = String(u.nome || p.nome || '').trim();
    const primeiro = nomeCompleto.split(/\s+/)[0] || '';
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    const id = ((await R.getDoc('idades/' + uid)) || {}).data || {};
    const anos = idadeDe(id.data);
    if (anos === null || anos < 18) return res.status(200).json({ ok: true, tipo: 'restrito' });
    const foto = String(u.foto || '');
    const fotoOk = /^https:\/\//.test(foto) || (/^data:image\//.test(foto) && foto.length < 200000) ? foto : '';
    if (p.fechado) return res.status(200).json({ ok: true, tipo: 'fechado', primeiro });
    // prévia só para quem escolheu ligar (contas novas de adultos já vêm ligadas)
    if (p.previa !== true) return res.status(200).json({ ok: true, tipo: 'semprevia', primeiro });
    const pl = ((await R.getDoc('planos/' + uid)) || {}).data || {};
    const ate = pl.ate ? new Date(pl.ate) : null;
    const plus = !!pl.plus && !!ate && ate > new Date();
    const itens = (Array.isArray(p.desejos) ? p.desejos : []).filter((w) => w && w.t).map((w) => ({ t: String(w.t).slice(0, 80), preco: String(w.preco || '').slice(0, 30), obs: String(w.obs || '').slice(0, 80), grau: String(w.grau || '').slice(0, 20), link: /^https:\/\//.test(String(w.link || '')) ? String(w.link).slice(0, 500) : '' }));
    return res.status(200).json({
      ok: true, tipo: 'aberto', nome: nomeCompleto.slice(0, 40), primeiro, handle, foto: fotoOk,
      plus, cab: plus && p.cab && typeof p.cab === 'object' ? p.cab : null, capa: plus ? String(p.capa || '') : '',
      frase: String(p.frase || '').slice(0, 120), dia: +p.dia || 0, mes: +p.mes || 0,
      desejos: itens.slice(0, 6), total: itens.length
    });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
};
