// Lê o link de um produto e devolve o nome, a foto e a loja, para quem está montando a lista.
// Chamado por /api/servicos?f=lerlink (POST {url}, com o login da pessoa).
// Usa o mesmo leitor do Painel (produto.js). Limite simples por pessoa para ninguém abusar.
const LIMITE = 40;              // leituras por pessoa
const JANELA = 60 * 60 * 1000;  // por hora
const usos = new Map();         // uid -> [horários] (vale por instância da função; é só um freio)

function podeUsar(uid) {
  const agora = Date.now();
  const lista = (usos.get(uid) || []).filter((t) => agora - t < JANELA);
  if (lista.length >= LIMITE) { usos.set(uid, lista); return false; }
  lista.push(agora); usos.set(uid, lista);
  if (usos.size > 5000) usos.clear();
  return true;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R, P;
  try { R = require('./_robo'); P = require('./produto'); } catch (e) { return res.status(500).json({ ok: false, erro: 'config' }); }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = token ? await R.usuarioDoToken(token).catch(() => null) : null;
  if (!user || !user.uid) return res.status(401).json({ ok: false, erro: 'login' });
  if (!podeUsar(user.uid)) return res.status(200).json({ ok: false, erro: 'Muitos links em pouco tempo. Preencha à mão ou tente daqui a pouco.' });

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  let url = String((body && body.url) || '').trim().slice(0, 1000);
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  let alvo; try { alvo = new URL(url); } catch (e) { return res.status(200).json({ ok: false, erro: 'Link inválido.' }); }
  if (!P.enderecoPermitido(alvo)) return res.status(200).json({ ok: false, erro: 'Link inválido.' });
  try {
    const { html, urlFinal } = await P.baixar(alvo.toString());
    const d = P.extrair(html, urlFinal);
    if (!d.titulo && !d.imagem) return res.status(200).json({ ok: false, loja: d.loja || P.nomeLoja(alvo.hostname) });
    return res.status(200).json({ ok: true, ...d });
  } catch (e) {
    const n = P.nomeDoLink(alvo);
    return res.status(200).json(n ? { ok: true, titulo: n, imagem: '', loja: P.nomeLoja(alvo.hostname) } : { ok: false, loja: P.nomeLoja(alvo.hostname) });
  }
};
