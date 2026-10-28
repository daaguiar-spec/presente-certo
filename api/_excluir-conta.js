// Exclusão de conta (LGPD, art. 18, VI). Chamado por /api/servicos?f=excluir-conta
// O aplicativo confirma a identidade da pessoa (senha ou Google) e chama esta rota com o token dela.
// Aqui o servidor (usuário-robô) apaga os dados ligados à conta. Depois o próprio aplicativo apaga o login.
// Ficam guardados só os registros de pagamento (creditos e assinaturas), pelo prazo da lei fiscal.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let R;
  try { R = require('./_robo'); } catch (e) { return res.status(500).json({ ok: false, erro: 'config' }); }
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await R.usuarioDoToken(token) : null;
    if (!user || !user.uid) return res.status(401).json({ ok: false, erro: 'login' });
    const uid = user.uid;
    const caminhos = [];
    const add = (p) => caminhos.push(p);
    const docs = async (coll) => { try { return await R.listDocs(coll); } catch (e) { return []; } };
    const busca = async (coll, campo, valor, grupo) => { try { return await R.consulta(coll, campo, 'EQUAL', valor, { grupo, limite: 1000 }); } catch (e) { return []; } };

    // documentos com o id da pessoa
    ['profiles', 'fichas', 'follows', 'acoes', 'agradecimentos', 'sorteios', 'parabens', 'usuarios', 'planos', 'metricas', 'push', 'respostas', 'idades']
      .forEach((c) => add(`${c}/${uid}`));
    // @ de usuário
    (await busca('usernames', 'uid', uid)).forEach((d) => add(d.path));
    // fotos, dados privados e visitas recebidas
    (await docs(`fotos/${uid}/itens`)).forEach((d) => add(d.path));
    (await docs(`data/users/${uid}`)).forEach((d) => add(d.path));
    (await docs(`visitas/${uid}/de`)).forEach((d) => add(d.path));
    // chaves Pix de vaquinhas que organizou e resultados de amigo secreto
    (await busca('vaqpix', 'org', uid)).forEach((d) => add(d.path));
    (await busca('sorteiores', 'org', uid)).forEach((d) => add(d.path));
    (await busca('sorteiores', 'de', uid)).forEach((d) => add(d.path));
    // listas de evento que criou (com as subcoleções)
    for (const ev of await busca('eventos', 'dono', uid)) {
      for (const sub of ['marcados', 'visitas', 'quem']) (await docs(`${ev.path}/${sub}`)).forEach((d) => add(d.path));
      add(ev.path);
    }
    // eventos de Amigo Secreto para Empresas que criou (com convites, participantes e resultados)
    for (const ev of await busca('empresas', 'dono', uid)) {
      for (const sub of ['convites', 'participantes', 'resultado']) (await docs(`${ev.path}/${sub}`)).forEach((d) => add(d.path));
      add(ev.path);
    }
    // sugestões e denúncias que enviou
    (await busca('feedback', 'uid', uid)).forEach((d) => add(d.path));
    (await busca('denuncias', 'uid', uid)).forEach((d) => add(d.path));

    // apaga em lote; se o lote falhar, tenta um por um para descobrir qual documento travou
    let n = 0; const falhas = [];
    try { n = await R.apagar(caminhos); }
    catch (e) {
      console.error('excluir-conta: lote falhou', uid, e && e.message);
      for (const p of [...new Set(caminhos)]) {
        try { const c = await R.commit([R.W.del(p)]); if (c.ok) n++; else falhas.push(p); }
        catch (e2) { falhas.push(p + ' (' + String(e2 && e2.message).slice(0, 80) + ')'); }
      }
    }
    if (falhas.length) {
      console.error('excluir-conta: não apagou', uid, falhas);
      return res.status(500).json({ ok: false, erro: 'parcial', apagados: n, detalhe: falhas.map((x) => x.replace(uid, '<id>')).join(' | ').slice(0, 300) });
    }
    return res.status(200).json({ ok: true, apagados: n });
  } catch (e) {
    console.error('excluir-conta: erro', e && e.message);
    return res.status(500).json({ ok: false, erro: 'falha', detalhe: String(e && e.message).slice(0, 160) });
  }
};
