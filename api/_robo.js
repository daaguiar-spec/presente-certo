// Acesso do servidor ao Firestore SEM chave de conta de serviço.
// O servidor entra no Firebase como um usuário-robô (e-mail e senha guardados só na Vercel)
// e usa a API REST do Firestore. As regras (firestore.rules) liberam gravações só para esse usuário.
//
// Variáveis na Vercel: ROBO_EMAIL e ROBO_SENHA (o login do usuário-robô criado no Firebase Authentication)
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'presentecerto-e3938';
const KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDqb-am7CUgvOIIRnR8wFN6cKVrKc1ZUzs'; // chave pública do site, não é secreta
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${ROOT}`;

let cache = { token: '', exp: 0 };
async function token() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  const email = process.env.ROBO_EMAIL, password = process.env.ROBO_SENHA;
  if (!email || !password) throw new Error('Faltam ROBO_EMAIL e ROBO_SENHA na Vercel');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const j = await r.json().catch(() => ({}));A
  if (!r.ok || !j.idToken) throw new Error('Login do robô falhou: ' + ((j.error && j.error.message) || r.status));
  cache = { token: j.idToken, exp: Date.now() + Math.max(60, (+j.expiresIn || 3600) - 300) * 1000 };
  return cache.token;
}

// Confere o login de quem chamou a API (o site manda o idToken da pessoa)
async function usuarioDoToken(idToken) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  const u = j.users && j.users[0];
  return u ? { uid: u.localId, email: String(u.email || '').toLowerCase(), verificado: !!u.emailVerified } : null;
}

// ---- conversão de valores ----
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: campos(v) } };
}
function campos(o) { const f = {}; Object.entries(o).forEach(([k, x]) => { if (x !== undefined) f[k] = enc(x); }); return f; }
function dec(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = dec(x); }); return o; }
  return null;
}
const caminho = (p) => p.split('/').map(encodeURIComponent).join('/');

async function getDoc(path) {
  const r = await fetch(`${FS}/${caminho(path)}`, { headers: { Authorization: 'Bearer ' + (await token()) } });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Leitura ' + path + ': ' + ((j.error && j.error.message) || r.status));
  const data = {}; Object.entries(j.fields || {}).forEach(([k, x]) => { data[k] = dec(x); });
  return { path, data, updateTime: j.updateTime };
}

// Operações de escrita. "pre" é o documento lido antes (para garantir que ninguém mudou no meio)
const W = {
  // merge: true grava só os campos informados; sem merge, troca o documento inteiro
  set(path, obj, { merge = false, pre } = {}) {
    const w = { update: { name: `${ROOT}/${path}`, fields: campos(obj) } };
    if (merge) w.updateMask = { fieldPaths: Object.keys(obj).filter((k) => obj[k] !== undefined) };
    if (pre !== undefined) w.currentDocument = pre ? { updateTime: pre.updateTime } : { exists: false };
    return w;
  },
  del(path) { return { delete: `${ROOT}/${path}` }; }
};

async function commit(writes) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${ROOT}:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) }, body: JSON.stringify({ writes })
  });
  if (r.ok) return { ok: true };
  const j = await r.json().catch(() => ({}));
  const st = (j.error && j.error.status) || '';
  if (st === 'FAILED_PRECONDITION' || st === 'ABORTED' || r.status === 409) return { ok: false, conflito: true };
  throw new Error('Gravação: ' + ((j.error && j.error.message) || r.status));
}

// Lê, decide e grava com conferência; repete se alguém mexer no meio
async function transacao(fn, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    const { writes, result } = await fn(getDoc);
    if (!writes || !writes.length) return result;
    const c = await commit(writes);
    if (c.ok) return result;
  }
  throw new Error('Muitas tentativas de gravação');
}

module.exports = { getDoc, commit, transacao, W, usuarioDoToken };
