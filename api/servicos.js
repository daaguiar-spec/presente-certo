// Uma só função na Vercel para os serviços de conta (o plano Hobby aceita no máximo 12 funções).
//  /api/servicos?f=sorteio        → amigo secreto sorteado no servidor (_sorteio.js)
//  /api/servicos?f=excluir-conta  → exclusão de conta pela própria pessoa (_excluir-conta.js)
//  /api/servicos?f=previa&u=@     → prévia pública do perfil (aberto, adulto) para quem ainda não tem conta (_previa.js)
const rotas = { 'sorteio': './_sorteio', 'excluir-conta': './_excluir-conta', 'previa': './_previa' };
module.exports = async (req, res) => {
  const f = String((req.query && req.query.f) || '');
  if (!rotas[f]) return res.status(404).json({ ok: false, erro: 'servico' });
  return require(rotas[f])(req, res);
};
