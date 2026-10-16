// Botão "Atualizar agora" do Painel: só o administrador pode chamar.
const ADMIN = String(process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const R = require('./_robo'), O = require('./_ofertas');
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const u = token ? await R.usuarioDoToken(token) : null;
    if (!u || !u.verificado || u.email !== ADMIN) return res.status(403).json({ ok: false, erro: 'Só o administrador' });
    const cfg = ((await R.getDoc('config/app')) || {}).data || {};
    const r = await O.atualizar(R, cfg);
    return res.status(200).json(r);
  } catch (e) {
    return res.status(200).json({ ok: false, erro: String(e && e.message || e).slice(0, 240) });
  }
};
