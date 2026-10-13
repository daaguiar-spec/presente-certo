# PresenteCerto: como colocar no ar

Este pacote é a versão independente do PresenteCerto, para funcionar fora do Claude, com endereço próprio na internet.

- **Firebase (Google):** cuida do login (Google e e-mail com senha) e guarda os dados. Plano gratuito.
- **GitHub:** guarda os arquivos do site.
- **Vercel:** publica o site e roda as sugestões por IA. Plano gratuito.

Tempo estimado: 30 a 40 minutos, sem precisar programar.

## O que tem na pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | O PresenteCerto inteiro (telas, Mural, fichas, Amigo secreto, Painel) |
| `firebase-config.js` | Onde você cola os dados do seu projeto Firebase (passo 4) |
| `firestore.rules` | Regras de segurança do banco de dados (passo 3) |
| `api/produto.js` | Lê o nome e a foto de um produto pelo link, para cadastrar Ofertas da semana |
| `api/publicar-evento.js` | Libera o link de uma lista de evento (usa 1 crédito, comprado ou dado pelo administrador) |
| `api/sugestoes.js` | Função que gera as sugestões de presente com IA |
| `cidades/` | Lista oficial de cidades do IBGE, um arquivo por estado (usada na busca de cidade) |
| `seed/dados-iniciais.json` | Seus dados da versão de teste, para importar no Painel (passo 9) |
| `manifest.json` e `icon.svg` | Nome e ícone quando alguém instala o site no celular |

---

## Passo 1. Criar o projeto no Firebase

1. Entre em **console.firebase.google.com** com sua conta Google (daaguiar@gmail.com).
2. Toque em **Criar um projeto** e dê o nome **presentecerto**.
3. O Google Analytics é opcional. Pode desativar.
4. Toque em **Criar projeto** e espere terminar.

## Passo 2. Ativar o login

1. No menu da esquerda: **Criação > Authentication** e toque em **Vamos começar**.
2. Na aba **Método de login**:
   - **Google:** ative, escolha seu e-mail de suporte e salve.
   - **E-mail/senha:** ative a primeira opção (E-mail/senha) e salve.

## Passo 3. Criar o banco de dados e colar as regras

1. No menu: **Criação > Firestore Database** e toque em **Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**.
3. Escolha **Iniciar no modo de produção** e confirme.
4. Abra a aba **Regras**, apague tudo o que está lá e cole todo o conteúdo do arquivo **firestore.rules**.
5. Toque em **Publicar**.

> As regras garantem que cada pessoa só altere os próprios dados, e que só você mexa em anúncios, avisos, afiliados e moderação.

## Passo 4. Ligar o site ao Firebase

1. No Firebase, toque na engrenagem **Configurações do projeto**.
2. Em **Seus apps**, toque no ícone **</>** (Web).
3. Apelido: **presentecerto**. Não marque o Hosting. Toque em **Registrar app**.
4. Vai aparecer um bloco com `apiKey`, `authDomain`, `projectId` e outros dados.
5. Abra o arquivo **firebase-config.js** num editor de texto (Bloco de Notas serve) e troque cada `COLE_AQUI...` pelo valor correspondente.
6. Salve o arquivo.

> Esses dados não são senha. Eles podem ficar no site sem problema; a segurança vem das regras do passo 3.

## Passo 5. Enviar os arquivos para o GitHub

1. Entre em **github.com** (crie a conta se ainda não tiver).
2. Toque em **New repository**. Nome: **presentecerto**. Pode deixar **Private**. Toque em **Create repository**.
3. Na página seguinte, toque em **uploading an existing file**.
4. Arraste **todo o conteúdo** da pasta `presentecerto` (os arquivos e as pastas `api` e `seed`), não a pasta em si.
5. Toque em **Commit changes**.

## Passo 6. Publicar na Vercel

1. Entre em **vercel.com** e toque em **Sign up / Continue with GitHub**.
2. Toque em **Add New > Project** e escolha o repositório **presentecerto**.
3. Em **Framework Preset**, deixe **Other**. Não precisa mexer em Build.
4. Abra **Environment Variables** e cadastre:

   | Nome | Valor |
   |---|---|
   | `FIREBASE_API_KEY` | o mesmo `apiKey` do passo 4 |
   | `ANTHROPIC_API_KEY` | sua chave da API do Claude (veja o passo 7) |

5. Toque em **Deploy**. Em um minuto aparece o endereço, algo como **presentecerto.vercel.app**.

## Passo 7. Chave da IA (sugestões de presente)

1. Entre em **console.anthropic.com**, crie a conta e cadastre um cartão.
2. Em **API Keys**, crie uma chave e copie (ela começa com `sk-ant-`).
3. Cole no `ANTHROPIC_API_KEY` da Vercel (passo 6). Se já tinha publicado, vá em **Settings > Environment Variables**, cadastre e depois **Deployments > Redeploy**.

> A IA é cobrada por uso, em centavos por pedido de sugestões. Cada pessoa pode pedir até 20 vezes por hora. Sem a chave, o resto do site funciona normalmente; só o botão de sugestões mostra que não está disponível.
>
> **Nunca** coloque essa chave dentro do `index.html` ou do `firebase-config.js`. Ela só vai na Vercel.

## Passo 8. Autorizar o endereço do site no Firebase

1. No Firebase: **Authentication > Configurações > Domínios autorizados**.
2. Toque em **Adicionar domínio** e cadastre o endereço da Vercel, por exemplo `presentecerto.vercel.app`, sem `https://`.

Sem este passo, o botão "Entrar com Google" mostra o erro de endereço não autorizado.

## Passo 9. Primeiro acesso e importação dos seus dados

1. Abra o endereço do site e toque em **Entrar com Google** usando **daaguiar@gmail.com**.
2. O botão escuro **Painel** aparece no topo. Ele só aparece para esse e-mail entrando pelo Google.
3. No Painel, desça até **Importar dados da versão de teste** e toque em **Importar dados > Confirmar importação**.
4. Voltam: sua ficha (com fotos e datas), o grupo Família, seu amigo secreto, os códigos de afiliado, o anúncio, os avisos e as 9 pessoas de exemplo.
5. Quando for convidar pessoas reais, use **Painel > Pessoas de exemplo > Ocultar exemplos**.

---

## Depois de publicado

- **Domínio próprio (presentecerto.com.br):** registre em **registro.br** e, na Vercel, vá em **Settings > Domains**. Depois cadastre o domínio também no passo 8.
- **Atualizar o site:** troque o arquivo no GitHub (Add file > Upload files). A Vercel publica sozinha em um minuto.
- **Convites:** a aba **Encontrar** e o **Amigo secreto** mandam o convite pelo WhatsApp com o endereço do site. A pessoa entra com Google ou cria conta com e-mail e senha.
- **Celular:** no iPhone (Safari) use **Compartilhar > Adicionar à Tela de Início**; no Android (Chrome), **⋮ > Adicionar à tela inicial**.

## Diferenças em relação à versão de teste no Claude

- **Contas:** cada pessoa cria a conta direto no site, com Google ou e-mail e senha, sem precisar de convite no Claude.
- **Lembrete diário no celular:** a tarefa agendada que eu criei funciona só com a versão de teste. Na versão pública, os lembretes aparecem dentro do site (aba Datas e Mural). Avisos por e-mail ou notificação no celular são um próximo passo.
- **Sugestões por IA:** usam a sua chave da Anthropic (passo 7), cobradas por uso.

## Antes de abrir ao público

- Publique **Termos de uso** e **Política de privacidade** (exigência da LGPD), porque o site guarda aniversários, tamanhos e alergias.
- Confira se o nome **PresenteCerto** está livre no **INPI** antes de investir na marca.
- Confira as regras dos programas de afiliados (Amazon e Magalu) para o site com domínio próprio.

---

## Plus automático com a Kiwify

Quando alguém paga o PresenteCerto Plus na Kiwify, o Plus liga sozinho. Quando há reembolso ou chargeback, desliga. Se a assinatura for cancelada, o Plus vale até o fim do período já pago.

**Arquivos envolvidos:** `api/kiwify.js`, `api/sincronizar-plano.js`, `api/_firebase.js` e `package.json`.

1. **Chave do servidor (Firebase):** Configurações do projeto → Contas de serviço → **Gerar nova chave privada**. Baixa um arquivo `.json`. Guarde com cuidado e nunca coloque no GitHub.
2. **Vercel → Settings → Environment Variables:**
   - `FIREBASE_SERVICE_ACCOUNT`: abra o arquivo `.json` no Bloco de Notas, copie **todo** o conteúdo e cole aqui.
   - `WEBHOOK_CHAVE`: invente uma senha longa, só com letras e números (ex.: `pc7Hq2Lm9Xa4Rt8Zw3`).
   - `KIWIFY_TOKEN` (opcional): o token que a Kiwify mostra ao criar o webhook.
   - Depois, em **Deployments**, faça **Redeploy**.
3. **Kiwify → Apps → Webhooks → Criar webhook:**
   - URL: `https://presente-certo-zeta.vercel.app/api/kiwify?chave=SUA_WEBHOOK_CHAVE`
   - Produto: o PresenteCerto Plus.
   - Eventos: compra aprovada, compra reembolsada, chargeback, assinatura renovada, assinatura cancelada e assinatura atrasada.
4. **Teste:** use o botão de teste da Kiwify ou faça uma compra de teste. A venda aparece em **Painel → PresenteCerto Plus → Assinaturas da Kiwify**.

**O e-mail precisa ser o mesmo.** O comprador é reconhecido pelo e-mail da compra. Se ainda não tiver conta, o Plus liga sozinho no primeiro acesso com aquele e-mail (pelo Google). Se o e-mail for diferente, ligue manualmente em **Painel → Usuários → Plus**.

**Planos:** a compra mensal dá 33 dias de Plus, e cada renovação soma mais 33. A anual dá 368 dias. Para ser reconhecido como anual, o nome do produto na Kiwify precisa ter a palavra "Anual".
