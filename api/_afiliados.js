// Códigos de afiliado públicos (os mesmos que aparecem nos links das lojas), para as páginas de guia de presentes.
// Chamado por /api/servicos?f=afiliados. Não tem dado pessoal: só lê config/app pelo usuário-robô.
module.exports = async (req, res) => {
  let R; try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false }); }
  try {
    const d = await R.getDoc('config/app');
    const c = (d && d.data) || {};
    const s = (v, n) => String(v || '').replace(/[^\w.-]/g, '').slice(0, n || 40);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
    return res.status(200).json({
      ok: true,
      amazon: s(c.amazonTag),
      shopee: s(c.shopeeId, 20).replace(/\D/g, ''),
      ml: c.mlEtiqueta !== undefined ? s(c.mlEtiqueta) : 'aguiardaniel16',
      mlTool: c.mlTool !== undefined ? s(c.mlTool, 20) : '34020195',
      magalu: s(c.magaluLoja, 60)
    });
  } catch (e) {
    console.error('afiliados', e && e.message);
    return res.status(200).json({ ok: false, amazon: '', shopee: '', ml: 'aguiardaniel16', mlTool: '34020195', magalu: '' });
  }
};
