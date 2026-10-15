// Manda um aviso de teste para os aparelhos da própria pessoa (usado logo depois de ativar)
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const R = require('./_robo'), P = require('./_push');
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user) return res.status(401).json({ ok: false, erro: 'login' });
    const d = await R.getDoc('push/' + user.uid);
    if (!d || !(d.data.subs || []).length) return res.status(404).json({ ok: false, erro: 'sem_aparelho' });
    await P.preparar();
    const r = await P.enviar(d.data.subs, { title: '🔔 Avisos ativados!', body: 'Você vai saber quando o aniversário de quem você segue estiver chegando.', url: '/', tag: 'teste' });
    if (r.vivos.length !== d.data.subs.length) await R.commit([R.W.set('push/' + user.uid, { subs: r.vivos }, { merge: true })]);
    return res.status(200).json({ ok: true, enviados: r.enviados });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: String(e && e.message).slice(0, 160) });
  }
};
