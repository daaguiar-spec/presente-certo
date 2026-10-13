// Chamado pelo site quando a pessoa entra: se ela comprou o Plus na Kiwify antes de criar a conta
// (ou com a conta ainda sem vínculo), liga o Plus agora, pelo e-mail da conta.
const { db, admin } = require('./_firebase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let user;
  try { user = await admin.auth().verifyIdToken(token); } catch (e) { return res.status(401).json({ ok: false }); }
  const email = String(user.email || '').toLowerCase();
  if (!email || !user.email_verified) return res.status(200).json({ ok: true, plus: false });

  const ref = db.doc('assinaturas/' + email.replace(/\//g, '_'));
  const snap = await ref.get();
  if (!snap.exists) return res.status(200).json({ ok: true, plus: false });
  const a = snap.data();
  const ate = a.ate ? a.ate.toDate() : null;
  if (!ate || ate <= new Date() || a.status === 'reembolsada') return res.status(200).json({ ok: true, plus: false });

  await db.doc('planos/' + user.uid).set({ plus: true, ate: a.ate, codigo: 'kiwify' });
  if (a.uid !== user.uid) await ref.set({ uid: user.uid }, { merge: true });
  return res.status(200).json({ ok: true, plus: true });
};
