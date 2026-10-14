// Publica uma lista de evento (libera o link para os convidados), gastando 1 crédito.
// Quem pode publicar: o administrador (grátis), quem tem crédito (comprou na Kiwify ou ganhou do administrador)
// ou assinante Plus (1 lista grátis por conta). O site chama este endereço com o login da pessoa.
const ADMIN = String(process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R;
  try { R = require('./_robo'); }
  catch (e) { return res.status(500).json({ ok: false, erro: 'config', detalhe: String(e && e.message).slice(0, 160) }); }
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user) return res.status(401).json({ ok: false, erro: 'login' });
    const id = String((req.body && req.body.id) || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) return res.status(400).json({ ok: false, erro: 'id' });
    const chave = user.email ? user.email.replace(/\//g, '_') : '';

    const out = await R.transacao(async (get) => {
      const ev = await get('eventos/' + id);
      if (!ev || ev.data.dono !== user.uid) return { result: { status: 404, erro: 'nao_encontrada' } };
      if (ev.data.publicado) return { result: { status: 200, ja: true } };
      const cr = chave ? await get('creditos/' + chave) : null;
      const pl = await get('planos/' + user.uid);
      const c = cr ? cr.data : {};
      const ehAdmin = user.verificado && user.email === ADMIN;
      const plus = !!(pl && pl.data.plus && pl.data.ate && pl.data.ate > new Date());
      const writes = [];
      let motivo = '';
      if (ehAdmin) motivo = 'admin';
      else if (user.verificado && (c.saldo || 0) >= 1) {
        motivo = 'credito';
        writes.push(R.W.set('creditos/' + chave, { saldo: (c.saldo || 0) - 1, usados: (c.usados || 0) + 1 }, { merge: true, pre: cr }));
      } else if (plus && !c.plusGratisUsado && chave) {
        motivo = 'plus';
        writes.push(R.W.set('creditos/' + chave, { plusGratisUsado: true, usados: (c.usados || 0) + 1 }, { merge: true, pre: cr }));
      } else return { result: { status: 402, erro: user.verificado ? 'sem_credito' : 'email_nao_verificado' } };
      writes.push(R.W.set('eventos/' + id, { publicado: true, publicadoEm: new Date(), publicadoPor: motivo }, { merge: true, pre: ev }));
      return { writes, result: { status: 200, motivo } };
    });
    const { status, ...resto } = out;
    return res.status(status).json({ ok: status === 200, ...resto });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'falha', detalhe: String(e && e.message).slice(0, 160) });
  }
};
