# Ativar usuários no Entrelinhas

O aplicativo já está configurado para o projeto `ntlcwlpvwkvrojodmyze`, em `https://ntlcwlpvwkvrojodmyze.supabase.co`. A chave publishable está em `public/access-config.json`; não é necessário criar variáveis no GitHub para usar essa configuração. Antes da ativação, confirme a instalação completa do SQL, publique a função e configure a conta master. A entrega deve ficar na branch de desenvolvimento até validar o acesso; a versão atual do Pages pode continuar funcionando enquanto isso.

## 1. Criar o projeto

O projeto já foi criado. Abra [seu projeto no Supabase](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze) para concluir os passos seguintes. Guarde a senha do banco em seu gerenciador de senhas. Para trocar de projeto futuramente, obtenha a URL e a chave **publishable** (ou a chave legada **anon**) em **Project Settings → API / API Keys**.

A URL e a chave pública podem ser usadas no aplicativo. A chave **service_role**, chaves **sb_secret**, senha do banco e token pessoal do Supabase nunca entram no código, Pages, backup ou chat. A função recebe sua credencial de servidor no próprio ambiente Supabase.

## 2. Preparar o banco

No [SQL Editor deste projeto](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/sql/new), execute o conteúdo completo de [202610130001_access_control.sql](../supabase/migrations/202610130001_access_control.sql). A chave pública usada pelo app não permite instalar esse SQL nem atribuir o master.

Em um projeto novo, execute depois [202610130002_commercial_access.sql](../supabase/migrations/202610130002_commercial_access.sql), nessa ordem. Se o projeto já tem usuários e master, use somente [a seção de atualização](#atualizar-um-projeto-já-ativo); não repita a primeira migração ou o bootstrap.

O SQL cria somente contas/permissões, sessões e histórico de acesso. As tabelas não contêm vídeos, áudio, PDFs, imagens, traduções, títulos de projetos ou backups. Não é necessário criar buckets de Storage.

Todas as novas contas começam como **pending**. Permissões não vêm de metadados fornecidos pelo usuário. O navegador pode consultar sua própria situação; não pode editar permissões ou consultar sessões/histórico. Operações administrativas são executadas pela função, com autorização conferida no banco.

## 3. Configurar e-mail e recuperação de senha

Em **Authentication → URL Configuration**, mantenha **Site URL** como `https://rmvitor.github.io/Video_Translate/` e acrescente estas **Redirect URLs**:

- `https://rmvitor.github.io/Video_Translate/` (login e convites antigos).
- `https://rmvitor.github.io/Video_Translate/nova-senha/` e `https://rmvitor.github.io/Video_Translate/nova-senha/**` (recuperação; o SDK pode acrescentar o identificador PKCE na query).
- `https://rmvitor.github.io/Video_Translate/confirmar-email/` e `https://rmvitor.github.io/Video_Translate/confirmar-email/**` (confirmação do cadastro).

A página pública para solicitar o link é `https://rmvitor.github.io/Video_Translate/recuperar-senha/`. As URLs com barra final são as usadas pelo app; o Pages redireciona a versão sem barra. São diretórios reais no build, sem depender de um redirecionamento SPA/404. Para testes locais, cadastre os mesmos caminhos na origem usada, por exemplo `http://localhost:5173/nova-senha/` e `http://localhost:5173/confirmar-email/`, incluindo as variantes `/**`. No servidor de testes, o prefixo é `http://127.0.0.1:4173/Video_Translate/`.

Em **Authentication → Providers → Email**, mantenha e-mail/senha e confirmação de e-mail ativos. Configure o mínimo de senha em **8 caracteres** e a opção **Lowercase, uppercase letters, digits and symbols**, conforme o padrão solicitado e o painel apresentado. Políticas com um mínimo maior continuam permitidas: espelhe o mínimo e a composição do Auth em `public/access-config.json`, na propriedade pública `passwordPolicy`:

```json
"passwordPolicy": { "minimumLength": 8, "requiredCharacters": "lower_upper_letters_digits_symbols" }
```

`requiredCharacters` aceita os valores do Supabase: `""`, `"letters_digits"`, `"lower_upper_letters_digits"` e `"lower_upper_letters_digits_symbols"`. O app mostra cada requisito separadamente na solicitação de acesso e na nova senha, marcando OK enquanto o usuário digita ou cola e voltando a Pendente quando um requisito deixa de ser atendido. O botão de olho permite mostrar/ocultar a senha no login, cadastro, nova senha, confirmação e backup. O app valida a confirmação e mantém um mínimo de 8. Login aceita senhas antigas; backup mantém seu mínimo independente de 8. O endpoint público de configuração do Auth não informa a política de senha: a configuração acima deve acompanhar o painel. O servidor valida todas as regras, inclusive senhas vazadas e reautenticação quando habilitadas. O app não desativa essas políticas. A chave pública não permite alterar configurações no painel.

Em **Authentication → Email Templates**, confira **Confirm signup**, **Reset password** e **Invite user**. Nos templates padrão, mantenha o link `{{ .ConfirmationURL }}` para que a verificação ocorra no Supabase e respeite o `emailRedirectTo`/`redirectTo` do app. Não substitua esse link apenas pelo Site URL: isso perde a verificação e a rota de recuperação. Confira também **Password changed** se as notificações de alteração estiverem habilitadas.

Configure o **SMTP** do projeto para enviar confirmação, recuperação e convites. O remetente padrão do Supabase é destinado a testes e pode restringir destinatários/envios. Configurações de SMTP e seus segredos ficam no Supabase. Ajuste também o prazo de validade dos links e os limites de envio no painel; o app trata links expirados, permite reenvio e apresenta respostas que não revelam a existência da conta.

O app usa PKCE com o SDK do Supabase no navegador, sem SSR. Tokens de sessão ficam no `sessionStorage`; verificadores PKCE ficam no `localStorage` por até uma hora, atravessam abas e são removidos após uso/expiração. Não entram em backups. Abra o e-mail no mesmo navegador/dispositivo em que solicitou o link. Sem o verificador, o app pede outro link; um callback inválido não aproveita uma sessão já aberta de outra conta.

Para permitir abrir o e-mail em outro navegador/dispositivo, é possível usar templates personalizados com verificação de `token_hash`, suportada pelo app. Exemplo para **Reset password**:

```html
<a href="{{ .SiteURL }}nova-senha/?token_hash={{ .TokenHash }}&type=recovery">Redefinir senha</a>
```

Para **Confirm signup**, use `{{ .SiteURL }}confirmar-email/?token_hash={{ .TokenHash }}&type=signup`. O Site URL deve terminar em `/`. Trate o token como credencial de uso único; o app remove parâmetros de callback após a verificação e usa `no-referrer`. Não registre tokens em analytics. Os templates padrão continuam compatíveis e os convites antigos com fragmento de sessão também são tratados.

A página `/nova-senha/` só salva com uma sessão válida, conferida novamente no servidor por `getUser()` antes de `updateUser()`. Depois do sucesso, encerra a sessão local e solicita login com a nova senha. Usuários conectados também podem acessar **Preferências → Alterar senha**. Recuperar ou confirmar uma conta nunca substitui a aprovação, a validade ou o bloqueio definidos pelo master.

Os testes de navegador usam o SDK real e Auth/Edge simulados: solicitação e reenvio, callback PKCE em outra aba, confirmação de senha, alteração e login com a senha nova, código/links expirados, ausência de sessão, confirmação de e-mail e políticas mais fortes. Envio SMTP e configurações do projeto hospedado precisam ser conferidos no painel e com um e-mail real após cadastrar as URLs; os testes não enviam mensagens nem alteram senhas de contas reais.

## 4. Publicar a função de controle de acesso

Instale/use o CLI oficial e autentique-se diretamente com o Supabase:

```sh
npx supabase login
npx supabase functions deploy access-control --project-ref ntlcwlpvwkvrojodmyze --no-verify-jwt
```

O `PROJECT_REF` aparece no painel e na URL do projeto. A função valida todo token com `auth.getUser()` e usa o `session_id` do token verificado. `--no-verify-jwt` desativa somente a checagem antiga do gateway, para compatibilidade com as chaves/signaturas atuais; a verificação de autenticação dentro da função continua obrigatória.

Se preferir usar somente o painel, abra [Edge Functions](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/functions), crie uma função chamada **access-control** pelo editor e substitua o código pelo conteúdo completo de [index.ts](../supabase/functions/access-control/index.ts). Publique a função e desative **Verify JWT** na configuração dela, pelo mesmo motivo descrito acima. As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo próprio Supabase; não copie a chave de servidor para o app.

Para incluir o navegador de desenvolvimento nas origens permitidas:

```sh
npx supabase secrets set ACCESS_ALLOWED_ORIGINS=https://rmvitor.github.io,http://localhost:5173,http://127.0.0.1:5173 --project-ref ntlcwlpvwkvrojodmyze
```

O padrão permite `https://rmvitor.github.io`. Informe origens, sem caminhos ou barra final. CORS não substitui a autenticação e as regras do banco.

No painel, essa configuração também pode ser criada em **Edge Functions → Secrets**, com o nome `ACCESS_ALLOWED_ORIGINS` e o valor `https://rmvitor.github.io,http://localhost:5173,http://127.0.0.1:5173`. Essa lista de origens é pública.

## 5. Conectar o aplicativo e definir o master

Para testar antes de publicar:

```sh
npm run dev
```

O arquivo público já configura este projeto. Um `.env` local é opcional para usar outro projeto; nesse caso, preencha os dois valores de `.env.example` juntos.

Cadastre sua conta na tela de login e confirme o e-mail. Ela ficará aguardando aprovação. No **SQL Editor**, execute uma única vez, substituindo pelo seu e-mail confirmado:

```sql
select public.bootstrap_access_master('seu-email-confirmado@empresa.com');
```

Essa operação só está disponível ao proprietário do banco/SQL Editor. Nenhuma conta pode se promover pelo aplicativo, pelo cadastro ou pela API. Há apenas um master. Depois clique em **Verificar acesso novamente** ou entre novamente para visualizar **Gestão de usuários**.

Outra opção é criar sua conta diretamente no painel Authentication do Supabase, confirmar o e-mail e então executar a mesma função. Não use um e-mail demonstrativo como master em produção.

## 6. Configurar o Pages e ativar a versão

Este projeto já usa `public/access-config.json`. Caso prefira configurar pelo build, no GitHub abra **Settings → Secrets and variables → Actions → Variables** e crie:

- `SUPABASE_URL`: a URL HTTPS do projeto.
- `SUPABASE_PUBLISHABLE_KEY`: a chave pública publishable/anon.

São configurações públicas, não credenciais administrativas. O build rejeita chaves secretas/service_role e exige os dois valores juntos. Variáveis do build têm prioridade sobre `public/access-config.json`: remova valores antigos ou mantenha ambos apontando para o projeto correto. Nunca coloque segredos nesse arquivo.

Depois de validar cadastro, confirmação, login master e a função publicada, leve a branch para `main` e execute o workflow **Publicar no GitHub Pages**. O build gera `dist/access-config.json`, ajusta a CSP ao projeto configurado e mantém o ID exclusivo `/Video_Translate/`. Sem configuração válida, a interface permanece bloqueada; não há liberação pública automática.

## Funcionamento do acesso

O master pode pesquisar contas, aprovar, bloquear, reativar, definir início/fim da liberação e limitar cada sessão entre 5 e 1.440 minutos. Alterar a política ou usar **Encerrar sessões** revoga as sessões anteriores. Reaprovar uma conta não ressuscita um token/sessão revogado: o usuário precisa sair e entrar novamente.

A autorização é renovada a cada 30 segundos com a aba visível e vale por até 65 segundos. A validade é definida pelo relógio do servidor; a interface usa uma contagem monotônica para a autorização temporária. Bloqueio, expiração, sessão encerrada ou perda da renovação interrompem a interface/processamento e preservam os dados locais. O login precisa de internet. O modo offline guarda a interface, arquivos e modelos, mas não concede acesso indefinido sem autorização.

O painel mostra IP observado no gateway, horários, navegador/dispositivo, tempo ativo aproximado e eventos administrativos. O tempo é estimado pelas confirmações com a aba visível, não mede produtividade. Um IP pode representar proxy/VPN; seu cabeçalho de origem é registrado e ele não é usado como prova de identidade. A disponibilidade do IP depende dos cabeçalhos entregues pelo gateway no projeto publicado.

Tentativas com senha inválida são registradas pelo **Supabase Auth** e devem ser consultadas em seus logs. O histórico do aplicativo registra entradas liberadas/negadas após autenticação, cadastro, saídas e mudanças de política. Não registra o que foi assistido ou lido.

O controle administrativo é aplicado no servidor. A ferramenta continua sendo código estático público: não é DRM e não torna uma cópia modificada do código inutilizável. Também não criptografa o IndexedDB nem impede alguém com acesso ao perfil do navegador de examinar arquivos locais. Use perfis confiáveis/separados para conteúdos internos.

## Biblioteca e backups locais

Cada conta tem um banco IndexedDB próprio neste navegador, identificado pelo ID da conta. O master não vê as bibliotecas dos usuários. Sair, bloquear ou expirar o acesso não apaga os arquivos. Não há sincronização de conteúdo com Supabase ou entre máquinas.

A biblioteca anterior ao login fica preservada. Ao entrar pela primeira vez, um aviso permite **Importar minha biblioteca anterior**, somente se os materiais forem seus. A importação mescla dados sem sobrescrever existentes; a cópia antiga permanece. Limpar a biblioteca pela ferramenta remove somente os materiais da conta atual e o cache de modelos, preservando outras contas e essa cópia antiga.

Em **Preferências → Backup local e transferência**:

1. Informe uma senha de pelo menos 8 caracteres e crie o backup.
2. O arquivo `.entrelinhas` contém projetos/subassuntos, textos/traduções, análises, progresso, imagens/prévias PDF e, opcionalmente, vídeos já guardados no dispositivo.
3. Os vídeos apenas abertos na sessão, modelos de IA, sessões Supabase e chaves Gemini ficam fora do arquivo.
4. Transfira o arquivo localmente, faça login na outra máquina e informe a senha para restaurar.

O backup usa ZIP sem compressão dentro de um envelope AES-256-GCM, com salt/IV aleatórios e chave derivada por PBKDF2-SHA256 (250.000 iterações). Nomes/textos também ficam criptografados. Senha incorreta ou alteração do arquivo impedem a restauração. Não há recuperação da senha pelo servidor.

A restauração valida o arquivo antes de escrever e usa uma única transação para as três bibliotecas. Itens com IDs já existentes são preservados; não há substituição silenciosa. O limite do arquivo é 512 MB e a criptografia exige memória; para vídeos maiores, exporte sem eles e transfira os originais separadamente. O app não envia nem guarda o backup na nuvem.

## Validação disponível

```sh
npm test
npm run build
npm run test:e2e
# Requer Docker. Executa PostgreSQL real em um contêiner efêmero, sem porta externa.
npm run test:access-db
```

Os testes de navegador usam o SDK real com um serviço Auth/Edge simulado e contas fictícias. Verificam aprovação, bloqueio/expiração, painel master, preservação da biblioteca, recuperação de senha e transferência de backup. Os testes PostgreSQL executam a migração e as regras reais de permissão/RLS, com uma tabela Auth mínima de teste. A função também foi verificada com o TypeScript do Deno.

Esses testes não substituem a validação do Supabase hospedado. Ainda precisam ser conferidos no projeto real: SMTP/links de e-mail, assinaturas e revogação do Auth, origem CORS, IP entregue pelo gateway e publicação da função.

## Atualizar um projeto já ativo

A versão 0.5 mantém as contas, o master e as sessões da versão anterior. **Não execute a primeira migração nem o bootstrap novamente.** Para habilitar todos os controles novos:

1. No SQL Editor do projeto `ntlcwlpvwkvrojodmyze`, execute somente [202610130002_commercial_access.sql](../supabase/migrations/202610130002_commercial_access.sql). [Abrir SQL sem formatação](https://raw.githubusercontent.com/rmvitor/Video_Translate/main/supabase/migrations/202610130002_commercial_access.sql).
2. Em Edge Functions → **access-control** → Edit, substitua todo o código de `index.ts` pela [versão atual](../supabase/functions/access-control/index.ts). [Abrir código sem formatação](https://raw.githubusercontent.com/rmvitor/Video_Translate/main/supabase/functions/access-control/index.ts). Clique em **Deploy updates** e aguarde concluir. Mantenha a verificação antiga do gateway desativada; o código valida todo token com Auth.
3. No app, abra **Gestão de usuários** e clique em **Atualizar**. O aviso de atualização pendente desaparece quando SQL e função estão atualizados.

Enquanto a atualização do backend estiver pendente, login e políticas existentes continuam funcionando; os controles novos ficam indisponíveis com uma orientação no painel. Não é necessário recriar contas nem informar senha/chave administrativa no app.

### Cadastro e convites

A tela inicial tem **Solicitar acesso**, com nome, e-mail, contato e senha. A confirmação de e-mail e a aprovação pelo master continuam obrigatórias. O contato é um dado de cadastro; nenhum título de projeto, arquivo ou texto de treinamento é incluído nessa solicitação.

O master pode **Adicionar usuário** enviando um convite por e-mail. O destinatário abre o link e define sua própria senha. A conta começa pendente e deve ser aprovada no painel. Convites precisam de SMTP funcionando no Supabase; se o e-mail já tem uma conta, gerencie o cadastro existente em vez de criar outro. O master não conhece nem define a senha dos clientes.

### Gestão comercial

O painel permite filtrar solicitações, liberados, bloqueados, expirados e acessos removidos. Há aprovação rápida, presets de liberação por 7/30/90 dias, início/fim, limite de sessão, contato, plano, situação do pagamento, valor, próximo pagamento e observações comerciais internas.

O registro de pagamentos é **manual**; esta versão não integra gateway, cartão, emissão de cobrança ou renovação automática. A validade de acesso é aplicada no servidor, independentemente do registro de pagamento. As observações comerciais ficam em uma tabela separada, inacessível aos clientes; não aparecem na resposta de autorização nem no backup local de materiais.

**Remover acesso** revoga as sessões e impede novas entradas. Preserva a identidade e o histórico, sem apagar a biblioteca local. O master pode liberar novamente pelo gerenciamento de acesso; as sessões antigas continuam revogadas. A conta master não pode ser removida ou rebaixada por essas ações.

### Senhas a partir da versão 0.6

No [painel de autenticação deste projeto](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/auth/providers), abra **Email**, defina **Minimum password length** como **8** e salve. O app valida esse mínimo no cadastro e na definição de nova senha; o Supabase também precisa aceitar o mesmo valor. A chave pública não permite alterar essa configuração. `supabase/config.toml` aplica o mínimo no ambiente local da CLI, mas não atualiza o Auth hospedado automaticamente.

Essa alteração não redefine as senhas existentes e não exige nova migração SQL nem republicação da função. O backup local também aceita 8 caracteres e preserva a compatibilidade dos arquivos anteriores.
