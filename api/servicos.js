// Uma só função na Vercel para os serviços de conta.
//  /api/servicos?f=sorteio        → amigo secreto sorteado no servidor (_sorteio.js)
//  /api/servicos?f=excluir-conta  → exclusão de conta pela própria pessoa (_excluir-conta.js)
//  /api/servicos?f=previa&u=@     → prévia pública do perfil (aberto, adulto) para quem ainda não tem conta (_previa.js)
// Os require são escritos por extenso para a Vercel incluir cada arquivo no pacote da função.
// Aceita o arquivo com ou sem o sublinhado no nome (ao baixar, alguns navegadores tiram o "_" do começo).
const tenta = (a, b) => { try { return a(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') return b(); throw e; } };
const rotas = {
  'sorteio': () => tenta(() => require('./_sorteio'), () => require('./sorteio')),
  'excluir-conta': () => tenta(() => require('./_excluir-conta'), () => require('./excluir-conta')),
  'previa': () => tenta(() => require('./_previa'), () => require('./previa'))
};
module.exports = async (req, res) => {
  const f = String((req.query && req.query.f) || '');
  if (!rotas[f]) return res.status(404).json({ ok: false, erro: 'servico' });
  let fn;
  try { fn = rotas[f](); }
  catch (e) {
    console.error('servicos: não carregou', f, e && e.message);
    return res.status(500).json({ ok: false, erro: 'carregar', detalhe: String(e && e.message).slice(0, 200) });
  }
  try { return await fn(req, res); }
  catch (e) {
    console.error('servicos: falhou', f, e && e.message);
    if (!res.headersSent) return res.status(500).json({ ok: false, erro: 'falha', detalhe: String(e && e.message).slice(0, 200) });
  }
};
