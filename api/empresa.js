// Amigo Secreto para Empresas.
//  acao "ativar"  : o RH usa 1 crédito comprado na Kiwify (pequeno/medio/grande) para liberar o evento
//  acao "sortear" : faz o sorteio no servidor e grava o resultado de cada pessoa num lugar que só ela lê
//  acao "lembrar" : manda aviso no celular para quem confirmou mas ainda não preencheu a ficha
const ADMIN = String(process.env.ADMIN_EMAIL || 'daaguiar@gmail.com').toLowerCase();
const PLANOS = { pequeno: { limite: 30, campo: 'empPequeno' }, medio: { limite: 100, campo: 'empMedio' }, grande: { limite: 300, campo: 'empGrande' } };
const APP = process.env.APP_URL || 'https://presente-certo-zeta.vercel.app';

// Sorteio com restrições: ninguém tira a si mesmo nem alguém proibido. Tenta várias vezes.
function sortearComRegras(ids, proibido) {
  for (let t = 0; t < 4000; t++) {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    // ciclo único: a[i] tira a[i+1]
    let ok = true; const p = {};
    for (let i = 0; i < a.length; i++) { const de = a[i], para = a[(i + 1) % a.length]; if (de === para || proibido(de, para)) { ok = false; break; } p[de] = para; }
    if (ok) return p;
  }
  return null;
}

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
    const acao = String(body.acao || '');
    if (!id) return res.status(400).json({ ok: false, erro: 'id' });
    const ehAdmin = user.verificado && user.email === ADMIN;
    const chave = user.email ? user.email.replace(/\//g, '_') : '';

    if (acao === 'ativar') {
      const plano = String(body.plano || '');
      if (!PLANOS[plano]) return res.status(400).json({ ok: false, erro: 'plano' });
      const out = await R.transacao(async (get) => {
        const ev = await get('empresas/' + id);
        if (!ev || ev.data.dono !== user.uid) return { result: { status: 404, erro: 'nao_encontrado' } };
        if (ev.data.pago && (PLANOS[ev.data.plano] || {}).limite >= PLANOS[plano].limite) return { result: { status: 200, ja: true } };
        const writes = [];
        let motivo = 'admin';
        if (!ehAdmin) {
          if (!user.verificado) return { result: { status: 402, erro: 'email_nao_verificado' } };
          const cr = chave ? await get('creditos/' + chave) : null; const c = cr ? cr.data : {};
          const campo = PLANOS[plano].campo;
          if ((c[campo] || 0) < 1) return { result: { status: 402, erro: 'sem_credito' } };
          writes.push(R.W.set('creditos/' + chave, { [campo]: c[campo] - 1, empUsados: (c.empUsados || 0) + 1 }, { merge: true, pre: cr }));
          motivo = 'credito';
        }
        writes.push(R.W.set('empresas/' + id, { pago: true, plano, limite: PLANOS[plano].limite, pagoEm: new Date(), pagoPor: motivo }, { merge: true, pre: ev }));
        return { writes, result: { status: 200, plano } };
      });
      const { status, ...resto } = out;
      return res.status(status).json({ ok: status === 200, ...resto });
    }

    const ev = await R.getDoc('empresas/' + id);
    if (!ev || ev.data.dono !== user.uid) return res.status(404).json({ ok: false, erro: 'nao_encontrado' });
    const parts = (await R.listDocs(`empresas/${id}/participantes`)).filter((p) => p.data.vai !== false);

    if (acao === 'sortear') {
      if (ev.data.sorteado) return res.status(200).json({ ok: true, ja: true });
      if (!ev.data.pago && !ehAdmin) return res.status(402).json({ ok: false, erro: 'nao_pago' });
      const limite = ehAdmin && !ev.data.pago ? 300 : (ev.data.limite || 0);
      if (parts.length < 3) return res.status(400).json({ ok: false, erro: 'poucos', n: parts.length });
      if (parts.length > limite) return res.status(400).json({ ok: false, erro: 'limite', n: parts.length, limite });
      const regras = Array.isArray(ev.data.regras) ? ev.data.regras : [];
      const proib = new Set(); regras.forEach((r) => { if (r && r.a && r.b) { proib.add(r.a + '>' + r.b); proib.add(r.b + '>' + r.a); } });
      const setor = {}; parts.forEach((p) => { setor[p.id] = String(p.data.setor || '').trim().toLowerCase(); });
      const porSetor = !!ev.data.porSetor && ev.data.plano === 'grande';
      const grupos = {};
      parts.forEach((p) => { const g = porSetor ? (setor[p.id] || '_') : '_'; (grupos[g] = grupos[g] || []).push(p.id); });
      const pares = {};
      for (const [g, ids] of Object.entries(grupos)) {
        if (ids.length < 2) return res.status(400).json({ ok: false, erro: 'setor_pequeno', setor: g });
        const p = sortearComRegras(ids, (a, b) => proib.has(a + '>' + b));
        if (!p) return res.status(400).json({ ok: false, erro: 'regras_impossiveis', setor: g });
        Object.assign(pares, p);
      }
      const info = {}; parts.forEach((p) => { info[p.id] = p.data; });
      const writes = Object.entries(pares).map(([de, para]) => R.W.set(`empresas/${id}/resultado/${de}`, { tirou: para, nome: String(info[para].nome || ''), setor: String(info[para].setor || ''), em: new Date() }));
      writes.push(R.W.set('empresas/' + id, { sorteado: true, sorteadoEm: new Date(), sorteadoN: parts.length }, { merge: true }));
      for (let i = 0; i < writes.length; i += 400) { const c = await R.commit(writes.slice(i, i + 400)); if (!c.ok) throw new Error('Gravação do sorteio'); }
      // aviso no celular (sem dizer quem tirou, para não aparecer na tela bloqueada)
      let avisados = 0;
      try {
        const P = require('./_push'); await P.preparar();
        for (const p of parts) {
          const d = await R.getDoc('push/' + p.id); if (!d || !(d.data.subs || []).length) continue;
          const r = await P.enviar(d.data.subs, { title: '🎁 Saiu o sorteio do amigo secreto!', body: `${ev.data.nome || 'Amigo secreto'}: abra para ver quem você tirou.`, url: `${APP}/?emp=${id}`, tag: 'emp-' + id });
          avisados += r.enviados;
        }
      } catch (e) { /* sem avisos não impede o sorteio */ }
      return res.status(200).json({ ok: true, n: parts.length, avisados });
    }

    if (acao === 'lembrar') {
      const P = require('./_push'); await P.preparar();
      let enviados = 0, alvo = 0;
      for (const p of parts) {
        const f = p.data.ficha || {};
        const sem = !(f.ideias || []).filter(Boolean).length;
        if (!sem && !ev.data.sorteado) continue;
        if (ev.data.sorteado) continue;
        alvo++;
        const d = await R.getDoc('push/' + p.id); if (!d || !(d.data.subs || []).length) continue;
        const r = await P.enviar(d.data.subs, { title: '🎁 Falta pouco!', body: `Preencha sua ficha do ${ev.data.nome || 'amigo secreto'} para quem te tirar acertar no presente.`, url: `${APP}/?emp=${id}`, tag: 'emp-lembrete-' + id });
        enviados += r.enviados;
      }
      return res.status(200).json({ ok: true, alvo, enviados });
    }

    return res.status(400).json({ ok: false, erro: 'acao' });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'falha', detalhe: String(e && e.message).slice(0, 160) });
  }
};
