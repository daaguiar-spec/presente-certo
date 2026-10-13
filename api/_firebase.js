// Conexão do servidor (Vercel) com o Firebase, usando a conta de serviço.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const conta = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({ credential: admin.credential.cert(conta) });
}

module.exports = { admin, db: admin.firestore() };
