// Lista de evento PREMIUM.
//  acao "ativar": transforma a lista em Premium (e publica, se ainda for rascunho), gastando 1 crédito Premium.
//     - crédito "premium" (compra de R$ 19,90): vale para qualquer lista
//     - crédito "premiumUp" (upgrade): vale só para lista que já foi publicada
//     - administrador: grátis
//  acao "quem": devolve quem deu cada presente (só para o dono, só em lista Premium, só a partir do dia do evento)
const ADMIN = String(process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R;
  try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false, erro: 'config' }); }
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user) return res.status(401).json({ ok: false, erro: 'login' });
    const body = req.body || {};
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '');
    const acao = String(body.acao || 'ativar');
    if (!id) return res.status(400).json({ ok: false, erro: 'id' });
    const chave = user.email ? user.email.replace(/\//g, '_') : '';
    const ehAdmin = user.verificado && user.email === ADMIN;

    if (acao === 'quem') {
      const ev = await R.getDoc('eventos/' + id);
      if (!ev || ev.data.dono !== user.uid) return res.status(404).json({ ok: false, erro: 'nao_encontrada' });
      if (!ev.data.premium) return res.status(403).json({ ok: false, erro: 'nao_premium' });
      const br = new Date(Date.now() - 3 * 3600e3);
      const hoje = br.toISOString().slice(0, 10);
      if (!ev.data.data) return res.status(200).json({ ok: true, liberado: false, motivo: 'sem_data' });
      if (String(ev.data.data) > hoje) return res.status(200).json({ ok: true, liberado: false, motivo: 'antes', data: ev.data.data });
      const desde = ev.data.premiumEm instanceof Date ? ev.data.premiumEm.getTime() : 0;
      const quem = await R.listDocs(`eventos/${id}/quem`);
      const marc = await R.listDocs(`eventos/${id}/marcados`);
      const em = {}; marc.forEach((m) => { em[m.id] = +m.data.em || 0; });
      const nomes = {};
      const out = [];
      for (const q of quem) {
        const uid = q.data.por; if (!uid) continue;
        if ((em[q.id] || 0) < desde) continue; // escolhido antes do Premium: o convidado não foi avisado, então não revela
        if (!(uid in nomes)) { const u = await R.getDoc('usuarios/' + uid); nomes[uid] = String(((u || {}).data || {}).nome || 'Convidado'); }
        out.push({ item: q.id, nome: nomes[uid] });
      }
      const ocultos = quem.length - out.length;
      return res.status(200).json({ ok: true, liberado: true, lista: out, ocultos });
    }

    // ativar
    const out = await R.transacao(async (get) => {
      const ev = await get('eventos/' + id);
      if (!ev || ev.data.dono !== user.uid) return { result: { status: 404, erro: 'nao_encontrada' } };
      if (ev.data.premium) return { result: { status: 200, ja: true } };
      const cr = chave ? await get('creditos/' + chave) : null;
      const c = cr ? cr.data : {};
      const writes = [];
      let motivo = '';
      if (ehAdmin) motivo = 'admin';
      else if (!user.verificado) return { result: { status: 402, erro: 'email_nao_verificado' } };
      else if (ev.data.publicado && (c.premiumUp || 0) >= 1) {
        motivo = 'upgrade';
        writes.push(R.W.set('creditos/' + chave, { premiumUp: c.premiumUp - 1, premiumUsados: (c.premiumUsados || 0) + 1 }, { merge: true, pre: cr }));
      } else if ((c.premium || 0) >= 1) {
        motivo = 'premium';
        writes.push(R.W.set('creditos/' + chave, { premium: c.premium - 1, premiumUsados: (c.premiumUsados || 0) + 1 }, { merge: true, pre: cr }));
      } else return { result: { status: 402, erro: 'sem_credito' } };
      const upd = { premium: true, premiumEm: new Date(), premiumPor: motivo };
      if (!ev.data.publicado) Object.assign(upd, { publicado: true, publicadoEm: new Date(), publicadoPor: 'premium' });
      writes.push(R.W.set('eventos/' + id, upd, { merge: true, pre: ev }));
      return { writes, result: { status: 200, motivo } };
    });
    const { status, ...resto } = out;
    return res.status(status).json({ ok: status === 200, ...resto });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'falha', detalhe: String(e && e.message).slice(0, 160) });
  }
};
