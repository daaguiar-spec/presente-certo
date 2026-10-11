// Função da Vercel: gera ideias de presente com a IA do Claude (Anthropic).
// Variáveis de ambiente necessárias na Vercel:
//   ANTHROPIC_API_KEY  -> sua chave da API da Anthropic (console.anthropic.com)
//   FIREBASE_API_KEY   -> o mesmo apiKey que está no firebase-config.js
//   ANTHROPIC_MODEL    -> opcional; padrão claude-sonnet-5-5

const LIMITE_POR_HORA = 20;
const usos = new Map(); // contagem simples por usuário, por instância

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

  const chave = process.env.ANTHROPIC_API_KEY;
  const fbKey = process.env.FIREBASE_API_KEY;
  if (!chave || !fbKey) return res.status(500).json({ erro: 'Faltam variáveis de ambiente na Vercel.' });

  // 1. Confere se quem pediu está logado no PresenteCerto
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'Entre na sua conta.' });
  let uid = '';
  try {
    const v = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    const vj = await v.json();
    uid = vj && vj.users && vj.users[0] && vj.users[0].localId;
  } catch (e) { uid = ''; }
  if (!uid) return res.status(401).json({ erro: 'Sessão inválida. Entre de novo.' });

  // 2. Limite simples de uso
  const agora = Date.now();
  const lista = (usos.get(uid) || []).filter(t => agora - t < 3600e3);
  if (lista.length >= LIMITE_POR_HORA) return res.status(429).json({ erro: 'Muitos pedidos. Tente mais tarde.' });
  lista.push(agora); usos.set(uid, lista);

  // 3. Pede as sugestões ao Claude
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const prompt = String((body && body.prompt) || '').slice(0, 8000);
  if (!prompt) return res.status(400).json({ erro: 'Pedido vazio.' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!r.ok) return res.status(502).json({ erro: 'A IA não respondeu. Tente de novo.' });
    const j = await r.json();
    const texto = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const ini = texto.search(/[\[{]/), fim = Math.max(texto.lastIndexOf(']'), texto.lastIndexOf('}'));
    const resultado = JSON.parse(texto.slice(ini, fim + 1));
    return res.status(200).json({ resultado });
  } catch (e) {
    return res.status(502).json({ erro: 'Não foi possível gerar sugestões agora.' });
  }
};
