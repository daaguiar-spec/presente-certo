// Indique e ganhe. Chamado por /api/servicos?f=indicacao (sempre POST, com o login da pessoa)
//  {acao:'registrar', ref:'@usuario'} → quem acabou de criar a conta pelo link de alguém registra quem convidou
//  {acao:'conferir'}                  → confere se a ficha do convidado já chegou a 30% e, se for o caso, dá o prêmio
// Só o servidor (usuário-robô) grava em indicacoes/ e indicados/ e liga o Plus em planos/.
// A indicação só vale quando o amigo monta pelo menos 30% da ficha.
// Prêmios: 3 amigos = 1 mês de Plus; 10 amigos = mais 5 meses (6 no total). Depois disso não há mais prêmio.
// O Plus de indicação (codigo 'indicacao') NÃO dá as listas de evento grátis (ver publicar-evento.js e o site).
const KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDqb-am7CUgvOIIRnR8wFN6cKVrKc1ZUzs'; // chave pública do site
const NIVEIS = [{ n: 3, dias: 30 }, { n: 10, dias: 150 }];
const MIN_PCT = 30;
const MAX_AMIGOS = 60;          // limite de convidados guardados por pessoa
const JANELA_CONTA = 3 * 864e5; // só conta como indicação uma conta criada há no máximo 3 dias
const DIA = 864e5;

// mesma conta do site (função completude)
function pct(p) {
  p = p || {};
  const t = (x) => String(x || '').trim();
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  const checks = [p.dia && p.mes, p.camiseta, p.calca, p.calcado, n(p.cores), n(p.estilos),
    t(p.gosta) || n(p.gostosTags), t(p.hobbies) || t(p.marcas) || n(p.marcasTags), n(p.desejos), n(p.precisa)];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

async function contaCriadaEm(idToken) {
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
    });
    const j = await r.json().catch(() => ({}));
    const u = j.users && j.users[0];
    return u && u.createdAt ? Number(u.createdAt) : 0;
  } catch (e) { return 0; }
}

const ativo = (pl) => !!(pl && pl.plus && pl.ate && new Date(pl.ate) > new Date());

async function conferir(R, uid) {
  const ind = await R.getDoc('indicados/' + uid);
  if (!ind || ind.data.ok) return { ok: true };
  const por = ind.data.por;
  const prof = await R.getDoc('profiles/' + uid);
  // ficha fechada: parte dos dados fica em fichas/ (se o robô não puder ler, conta só o perfil)
  let priv = null; try { priv = await R.getDoc('fichas/' + uid); } catch (e) { priv = null; }
  if (pct({ ...((prof && prof.data) || {}), ...((priv && priv.data) || {}) }) < MIN_PCT) return { ok: true, falta: true };
  return R.transacao(async (get) => {
    const d = await get('indicacoes/' + por);
    const i2 = await get('indicados/' + uid);
    if (!i2 || i2.data.ok) return { result: { ok: true } };
    const dados = (d && d.data) || {};
    const amigos = { ...(dados.amigos || {}) };
    const agora = new Date();
    amigos[uid] = { ...(amigos[uid] || { nome: '', em: agora.toISOString() }), ok: true, okEm: agora.toISOString() };
    const validos = Object.values(amigos).filter((a) => a && a.ok).length;
    const premios = Array.isArray(dados.premios) ? dados.premios.slice() : [];
    const novos = NIVEIS.filter((l) => validos >= l.n && !premios.some((p) => p && p.n === l.n));
    const writes = [];
    let ganhou = 0;
    if (novos.length) {
      const pl = await get('planos/' + por);
      const atual = pl && pl.data;
      ganhou = novos.reduce((s, l) => s + l.dias, 0);
      const base = ativo(atual) ? new Date(atual.ate).getTime() : agora.getTime();
      // se a pessoa já paga o Plus, só estende a data e mantém o código dela
      const codigo = ativo(atual) && atual.codigo && atual.codigo !== 'indicacao' ? atual.codigo : 'indicacao';
      writes.push(R.W.set('planos/' + por, { plus: true, ate: new Date(base + ganhou * DIA), codigo }, { pre: pl }));
      novos.forEach((l) => premios.push({ n: l.n, dias: l.dias, em: agora.toISOString() }));
    }
    writes.push(R.W.set('indicacoes/' + por, { ...dados, amigos, validos, premios, atualizado: agora.toISOString() }, { pre: d }));
    writes.push(R.W.set('indicados/' + uid, { ...i2.data, ok: true, okEm: agora.toISOString() }, { pre: i2 }));
    return { writes, result: { ok: true, valeu: true, ganhou } };
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R; try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false, erro: 'config' }); }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = token ? await R.usuarioDoToken(token) : null;
  if (!user || !user.uid) return res.status(401).json({ ok: false, erro: 'login' });
  const uid = user.uid;
  try {
    if (body.acao === 'registrar') {
      const ref = String(body.ref || '').replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9._]{3,20}$/.test(ref)) return res.status(200).json({ ok: true, ignorado: 'ref' });
      const criado = await contaCriadaEm(token);
      if (!criado || Date.now() - criado > JANELA_CONTA) return res.status(200).json({ ok: true, ignorado: 'conta' });
      const un = await R.getDoc('usernames/' + ref);
      const por = un && un.data && un.data.uid;
      if (!por || por === uid) return res.status(200).json({ ok: true, ignorado: 'ref' });
      const us = await R.getDoc('usuarios/' + uid);
      const nome = String((us && us.data && us.data.nome) || '').trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 40);
      const reg = await R.transacao(async (get) => {
        const ja = await get('indicados/' + uid);
        if (ja) return { result: { ja: true } };
        const d = await get('indicacoes/' + por);
        const dados = (d && d.data) || {};
        const amigos = { ...(dados.amigos || {}) };
        if (Object.keys(amigos).length >= MAX_AMIGOS) return { result: { cheio: true } };
        const agora = new Date().toISOString();
        amigos[uid] = { nome, em: agora, ok: false };
        return {
          writes: [
            R.W.set('indicados/' + uid, { por, em: agora, ok: false }, { pre: null }),
            R.W.set('indicacoes/' + por, { ...dados, amigos, validos: dados.validos || 0, premios: dados.premios || [], atualizado: agora }, { pre: d })
          ],
          result: { registrado: true }
        };
      });
      if (!reg.registrado) return res.status(200).json({ ok: true, ...reg });
      const c = await conferir(R, uid);
      return res.status(200).json({ ok: true, registrado: true, ...c });
    }
    if (body.acao === 'conferir') return res.status(200).json(await conferir(R, uid));
    return res.status(400).json({ ok: false, erro: 'acao' });
  } catch (e) {
    console.error('indicacao', e && e.message);
    return res.status(500).json({ ok: false, erro: 'falha' });
  }
};
