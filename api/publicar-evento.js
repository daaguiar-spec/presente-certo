// Publica uma lista de evento (libera o link para os convidados), gastando 1 crédito.
// Quem pode publicar: o administrador (grátis), quem tem crédito (comprou na Kiwify ou ganhou do administrador)
// ou assinante Plus (1 lista grátis por conta). O site chama este endereço com o login da pessoa.
const { db, admin } = require('./_firebase');

const ADMIN = String(process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let user;
  try { user = await admin.auth().verifyIdToken(token); } catch (e) { return res.status(401).json({ ok: false, erro: 'login' }); }
  const email = String(user.email || '').toLowerCase();
  const id = String((req.body && req.body.id) || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return res.status(400).json({ ok: false, erro: 'id' });

  const evRef = db.doc('eventos/' + id);
  const crRef = email ? db.doc('creditos/' + email.replace(/\//g, '_')) : null;
  const plRef = db.doc('planos/' + user.uid);
  try {
    const out = await db.runTransaction(async (t) => {
      const ev = await t.get(evRef);
      if (!ev.exists || ev.data().dono !== user.uid) return { status: 404, erro: 'nao_encontrada' };
      if (ev.data().publicado) return { status: 200, ja: true };
      const cr = crRef ? await t.get(crRef) : null;
      const pl = await t.get(plRef);
      const c = cr && cr.exists ? cr.data() : {};
      const verificado = !!user.email_verified;
      const ehAdmin = verificado && email === ADMIN;
      const pd = pl.exists ? pl.data() : null;
      const plus = !!(pd && pd.plus && pd.ate && pd.ate.toDate() > new Date());
      let motivo = '';
      if (ehAdmin) motivo = 'admin';
      else if (verificado && (c.saldo || 0) >= 1) { motivo = 'credito'; t.set(crRef, { saldo: (c.saldo || 0) - 1, usados: (c.usados || 0) + 1 }, { merge: true }); }
      else if (plus && !c.plusGratisUsado && crRef) { motivo = 'plus'; t.set(crRef, { plusGratisUsado: true, usados: (c.usados || 0) + 1 }, { merge: true }); }
      else return { status: 402, erro: verificado ? 'sem_credito' : 'email_nao_verificado' };
      t.update(evRef, { publicado: true, publicadoEm: admin.firestore.Timestamp.now(), publicadoPor: motivo });
      return { status: 200, motivo };
    });
    const { status, ...resto } = out;
    return res.status(status).json({ ok: status === 200, ...resto });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'falha' });
  }
};
