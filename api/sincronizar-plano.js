// Chamado pelo site quando a pessoa entra: se ela comprou o Plus na Kiwify antes de criar a conta
// (ou com a conta ainda sem vínculo), liga o Plus agora, pelo e-mail da conta.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R;
  try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false }); }
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user) return res.status(401).json({ ok: false });
    if (!user.email || !user.verificado) return res.status(200).json({ ok: true, plus: false });

    const chave = user.email.replace(/\//g, '_');
    const s = await R.getDoc('assinaturas/' + chave);
    if (!s) return res.status(200).json({ ok: true, plus: false });
    const a = s.data;
    if (!a.ate || a.ate <= new Date() || a.status === 'reembolsada') return res.status(200).json({ ok: true, plus: false });

    const writes = [R.W.set('planos/' + user.uid, { plus: true, ate: a.ate, codigo: 'kiwify' })];
    if (a.uid !== user.uid) writes.push(R.W.set('assinaturas/' + chave, { uid: user.uid }, { merge: true }));
    await R.commit(writes);
    return res.status(200).json({ ok: true, plus: true });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
};
