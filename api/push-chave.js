// Devolve a chave pública das notificações (o site precisa dela para ativar os avisos no celular)
module.exports = async (req, res) => {
  try {
    const P = require('./_push');
    const k = await P.chaves();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ ok: true, chave: k.publica });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: String(e && e.message).slice(0, 160) });
  }
};
