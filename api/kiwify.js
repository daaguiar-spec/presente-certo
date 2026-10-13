// Recebe os avisos (webhooks) da Kiwify e liga/desliga o PresenteCerto Plus sozinho.
// Endereço para cadastrar na Kiwify:  https://SEU-SITE/api/kiwify?chave=SUA_CHAVE_SECRETA
//
// Variáveis de ambiente na Vercel:
//   FIREBASE_SERVICE_ACCOUNT  -> conteúdo do arquivo JSON da conta de serviço do Firebase
//   WEBHOOK_CHAVE             -> uma senha longa inventada por você (a mesma do endereço acima)
//   KIWIFY_TOKEN              -> (opcional) o token do webhook na Kiwify, para conferir a assinatura
//   PLUS_DIAS_MENSAL / PLUS_DIAS_ANUAL -> (opcional) dias de Plus por pagamento; padrão 33 e 368

const crypto = require('crypto');
const { db, admin } = require('./_firebase');

function lerCorpo(req) {
  // Lê o corpo cru primeiro (necessário para conferir a assinatura); se já tiver sido lido, usa o objeto pronto
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw && req.body && typeof req.body === 'object') return resolve({ raw: JSON.stringify(req.body), json: req.body });
      let json = {}; try { json = JSON.parse(raw || '{}'); } catch (e) { json = {}; } resolve({ raw, json });
    });
    req.on('error', () => resolve({ raw: '', json: {} }));
  });
}
const iguais = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  // 1. Segurança: a chave secreta precisa vir no endereço
  const chave = process.env.WEBHOOK_CHAVE;
  if (!chave || !iguais(req.query && req.query.chave, chave)) return res.status(401).json({ ok: false, erro: 'chave inválida' });

  const { raw, json: b } = await lerCorpo(req);

  // 2. Se houver token da Kiwify configurado e a assinatura vier junto, confere também
  const tk = process.env.KIWIFY_TOKEN, sig = req.query && req.query.signature;
  if (tk && sig) {
    const calc = crypto.createHmac('sha1', tk).update(raw).digest('hex');
    if (!iguais(calc, sig)) return res.status(401).json({ ok: false, erro: 'assinatura inválida' });
  }

  // 3. Entende o aviso
  const evento = String(b.webhook_event_type || b.trigger || b.event || '').toLowerCase();
  const status = String(b.order_status || '').toLowerCase();
  const cliente = b.Customer || b.customer || {};
  const email = String(cliente.email || b.email || '').trim().toLowerCase();
  if (!email) return res.status(200).json({ ok: true, ignorado: 'sem e-mail' });

  const ATIVA = ['order_approved', 'compra_aprovada', 'subscription_renewed'];
  const DESLIGA = ['order_refunded', 'compra_reembolsada', 'chargeback', 'order_chargedback'];
  let acao = 'nada';
  if (ATIVA.includes(evento) || (!evento && status === 'paid')) acao = 'ativar';
  else if (DESLIGA.includes(evento) || ['refunded', 'chargedback'].includes(status)) acao = 'desligar';
  else if (evento === 'subscription_canceled') acao = 'cancelada';
  else if (evento === 'subscription_late') acao = 'atrasada';

  // Mensal ou anual: tenta ler a frequência do plano; se não houver, considera mensal
  const freq = String((((b.Subscription || {}).plan || {}).frequency) || (b.Subscription || {}).frequency || '').toLowerCase();
  const nomeProd = String(((b.Product || {}).product_name) || '').toLowerCase();
  const anual = /year|annual|anual/.test(freq) || /anual/.test(nomeProd);
  const dias = anual ? (+process.env.PLUS_DIAS_ANUAL || 368) : (+process.env.PLUS_DIAS_MENSAL || 33);

  // 3b. Compra da LISTA DE EVENTO (R$ 9,90): soma 1 crédito para o e-mail e termina aqui.
  // O produto é reconhecido pelo nome (padrão: contém "lista de evento") ou por EVENTO_PRODUTO_ID.
  const prod = b.Product || {};
  const idEnv = process.env.EVENTO_PRODUTO_ID, nomeEnv = String(process.env.EVENTO_PRODUTO_NOME || 'lista de evento').toLowerCase();
  const ehEvento = (idEnv && String(prod.product_id || '') === idEnv) || nomeProd.includes(nomeEnv);
  if (ehEvento) {
    const pedido = String(b.order_id || '');
    const cref = db.doc('creditos/' + email.replace(/\//g, '_'));
    const r = await db.runTransaction(async (t) => {
      const s = await t.get(cref); const c = s.exists ? s.data() : {};
      const pedidos = Array.isArray(c.pedidos) ? c.pedidos : [];
      const ja = pedido && pedidos.includes(pedido);
      if (acao === 'ativar' && !ja) { t.set(cref, { email, saldo: (c.saldo || 0) + 1, pedidos: pedido ? [...pedidos, pedido].slice(-50) : pedidos, atualizado: admin.firestore.Timestamp.now() }, { merge: true }); return 'credito +1'; }
      if (acao === 'desligar' && ja) { t.set(cref, { saldo: Math.max(0, (c.saldo || 0) - 1), pedidos: pedidos.filter((x) => x !== pedido), atualizado: admin.firestore.Timestamp.now() }, { merge: true }); return 'credito -1'; }
      return 'nada';
    });
    return res.status(200).json({ ok: true, evento: r });
  }

  const agora = new Date();
  const ref = db.doc('assinaturas/' + email.replace(/\//g, '_'));
  const antes = (await ref.get()).data() || {};
  let ate = antes.ate ? antes.ate.toDate() : null;
  if (acao === 'ativar') ate = new Date(Math.max(Date.now(), ate ? ate.getTime() : 0) + dias * 864e5);
  if (acao === 'desligar') ate = agora;

  const novoStatus = { ativar: 'ativa', desligar: 'reembolsada', cancelada: 'cancelada', atrasada: 'atrasada' }[acao] || antes.status || 'recebida';
  const registro = {
    email, status: novoStatus, ultimoEvento: evento || status || 'desconhecido', plano: anual ? 'anual' : 'mensal',
    nome: String(cliente.full_name || cliente.name || '').slice(0, 80), pedido: String(b.order_id || ''),
    atualizado: admin.firestore.Timestamp.now()
  };
  if (ate) registro.ate = admin.firestore.Timestamp.fromDate(ate);

  // 4. Encontra a conta pelo e-mail e liga/desliga o Plus
  let uid = antes.uid || '';
  if (!uid) { try { uid = (await admin.auth().getUserByEmail(email)).uid; } catch (e) { uid = ''; } }
  registro.uid = uid;
  await ref.set(registro, { merge: true });

  if (uid) {
    const plano = db.doc('planos/' + uid);
    if (acao === 'ativar') await plano.set({ plus: true, ate: admin.firestore.Timestamp.fromDate(ate), codigo: 'kiwify' });
    if (acao === 'desligar') await plano.delete();
    // cancelada/atrasada: o Plus continua até a data já paga e termina sozinho
  }
  return res.status(200).json({ ok: true, acao, vinculado: !!uid });
};
