// Notificações no celular (Web Push). As chaves VAPID são criadas sozinhas na primeira vez
// e guardadas no Firestore (pushchave/vapid), que só o usuário-robô consegue ler.
const webpush = require('web-push');
const R = require('./_robo');

async function chaves() {
  let d = await R.getDoc('pushchave/vapid');
  if (d && d.data.publica && d.data.privada) return d.data;
  const k = webpush.generateVAPIDKeys();
  const c = await R.commit([R.W.set('pushchave/vapid', { publica: k.publicKey, privada: k.privateKey, criado: new Date() }, { pre: null })]);
  if (c.ok) return { publica: k.publicKey, privada: k.privateKey };
  d = await R.getDoc('pushchave/vapid'); // outra chamada criou ao mesmo tempo
  return d.data;
}

async function preparar() {
  const k = await chaves();
  webpush.setVapidDetails('mailto:' + (process.env.ADMIN_EMAIL || 'daaguiar@gmail.com'), k.publica, k.privada);
  return k;
}

// Envia para todos os aparelhos da pessoa; devolve os aparelhos que continuam válidos
async function enviar(subs, msg) {
  const vivos = []; let enviados = 0;
  for (const s of subs || []) {
    if (!s || !s.endpoint || !s.keys) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 60 * 60 * 20 });
      vivos.push(s); enviados++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) continue; // aparelho desinstalou ou desativou
      vivos.push(s);
    }
  }
  return { vivos, enviados };
}

module.exports = { chaves, preparar, enviar };
