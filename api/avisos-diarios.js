// Roda uma vez por dia (agendado no vercel.json) e manda as notificações de aniversário.
// Só envia uma vez por dia: se for chamado de novo no mesmo dia, não faz nada.
const APP = process.env.APP_URL || 'https://presente-certo-zeta.vercel.app';
const AVISO_PROPRIO = [15, 7]; // dias antes do PRÓPRIO aniversário para lembrar de mandar a lista

module.exports = async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.authorization !== 'Bearer ' + segredo) return res.status(401).json({ ok: false });
  try {
    const R = require('./_robo'), P = require('./_push');
    const br = new Date(Date.now() - 3 * 3600e3); // horário de Brasília
    const Y = br.getUTCFullYear(), M = br.getUTCMonth(), D = br.getUTCDate();
    const hoje = `${Y}-${String(M + 1).padStart(2, '0')}-${String(D).padStart(2, '0')}`;

    // trava: uma vez por dia
    const ja = await R.transacao(async (get) => {
      const e = await get('pushchave/envio');
      if (e && e.data.dia === hoje) return { result: true };
      return { writes: [R.W.set('pushchave/envio', { dia: hoje, em: new Date() }, { pre: e || null })], result: false };
    });
    if (ja) return res.status(200).json({ ok: true, ja: true });

    await P.preparar();
    const base = Date.UTC(Y, M, D);
    const dias = (p) => {
      if (!p || !p.dia || !p.mes) return null;
      let alvo = Date.UTC(Y, +p.mes - 1, +p.dia); if (alvo < base) alvo = Date.UTC(Y + 1, +p.mes - 1, +p.dia);
      return Math.round((alvo - base) / 864e5);
    };
    const cacheP = {}, cacheN = {};
    const perfil = async (id) => (id in cacheP ? cacheP[id] : (cacheP[id] = ((await R.getDoc('profiles/' + id)) || {}).data || null));
    const nome = async (id) => (id in cacheN ? cacheN[id] : (cacheN[id] = String((((await R.getDoc('usuarios/' + id)) || {}).data || {}).nome || 'Alguém').split(' ')[0]));
    const lista = (ns) => ns.length <= 2 ? ns.join(' e ') : ns.slice(0, -1).join(', ') + ' e ' + ns[ns.length - 1];

    const docs = await R.listDocs('push');
    let pessoas = 0, enviados = 0;
    for (const d of docs) {
      const uid = d.id, subs = d.data.subs || [];
      if (!subs.length) continue;
      const msgs = [];
      const eu = await perfil(uid);
      const antecede = Math.min(Math.max(+((eu || {}).aviso) || 7, 1), 30);
      const fol = (((await R.getDoc('follows/' + uid)) || {}).data || {}).ids || [];
      const hojeIds = [], antesIds = [];
      for (const id of fol.slice(0, 500)) {
        if (id === uid) continue;
        const n = dias(await perfil(id));
        if (n === 0) hojeIds.push(id); else if (n === antecede) antesIds.push(id);
      }
      if (hojeIds.length) {
        const ns = []; for (const id of hojeIds) ns.push(await nome(id));
        msgs.push({ title: `🎂 Hoje é aniversário de ${lista(ns)}!`, body: 'Deixe seus parabéns e veja a lista de desejos.', url: hojeIds.length === 1 ? `${APP}/?u=${encodeURIComponent(hojeIds[0])}` : APP + '/', tag: 'aniv-hoje' });
      }
      if (antesIds.length) {
        const ns = []; for (const id of antesIds) ns.push(await nome(id));
        msgs.push({ title: `🎁 Faltam ${antecede} ${antecede === 1 ? 'dia' : 'dias'} para o aniversário de ${lista(ns)}`, body: 'Veja a lista de desejos e escolha o presente certo.', url: antesIds.length === 1 ? `${APP}/?u=${encodeURIComponent(antesIds[0])}` : APP + '/', tag: 'aniv-antes' });
      }
      const meu = dias(eu);
      if (AVISO_PROPRIO.includes(meu)) msgs.push({ title: `🎉 Seu aniversário é em ${meu} dias!`, body: 'Mande sua lista de desejos para a família e os amigos acertarem no presente.', url: APP + '/', tag: 'aniv-meu' });
      if (!msgs.length) continue;
      pessoas++;
      let vivos = subs;
      for (const m of msgs) { const r = await P.enviar(vivos, m); vivos = r.vivos; enviados += r.enviados; }
      if (vivos.length !== subs.length) await R.commit([R.W.set('push/' + uid, { subs: vivos }, { merge: true })]);
    }
    return res.status(200).json({ ok: true, dia: hoje, pessoas, enviados });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: String(e && e.message).slice(0, 200) });
  }
};
