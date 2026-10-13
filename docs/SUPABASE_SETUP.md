# Ativar usuários no Entrelinhas

Esta entrega está preparada para Supabase, mas ainda precisa de um projeto real. Sem URL e chave pública, o novo build mostra **Acesso em preparação** e não libera a ferramenta. Por isso, a entrega deve ficar na branch de desenvolvimento até concluir a configuração; a versão atual do Pages pode continuar funcionando enquanto isso.

## 1. Criar o projeto

Abra [Supabase](https://supabase.com/dashboard) e crie um projeto. Guarde a senha do banco em seu gerenciador de senhas. Em **Project Settings → API / API Keys**, copie a URL e a chave **publishable** (ou a chave legada **anon**).

A URL e a chave pública podem ser usadas no aplicativo. A chave **service_role**, chaves **sb_secret**, senha do banco e token pessoal do Supabase nunca entram no código, Pages, backup ou chat. A função recebe sua credencial de servidor no próprio ambiente Supabase.

## 2. Preparar o banco

No **SQL Editor** do projeto novo, execute o conteúdo completo de [202610130001_access_control.sql](../supabase/migrations/202610130001_access_control.sql).

O SQL cria somente contas/permissões, sessões e histórico de acesso. As tabelas não contêm vídeos, áudio, PDFs, imagens, traduções, títulos de projetos ou backups. Não é necessário criar buckets de Storage.

Todas as novas contas começam como **pending**. Permissões não vêm de metadados fornecidos pelo usuário. O navegador pode consultar sua própria situação; não pode editar permissões ou consultar sessões/histórico. Operações administrativas são executadas pela função, com autorização conferida no banco.

## 3. Configurar e-mail e recuperação de senha

Em **Authentication → URL Configuration**:

- **Site URL:** `https://rmvitor.github.io/Video_Translate/`
- **Redirect URLs:** `https://rmvitor.github.io/Video_Translate/`
- Para testar localmente, acrescente `http://localhost:5173/` ou o endereço exato usado no desenvolvimento.

Em **Authentication → Providers → Email**, mantenha e-mail/senha e confirmação de e-mail ativos. Configure o mínimo de senha em 12 caracteres para novas contas.

Configure o **SMTP** do projeto para enviar confirmação e recuperação aos usuários. O remetente padrão do Supabase é destinado a testes e pode restringir os destinatários/envios. As configurações de SMTP e seus segredos ficam no Supabase.

O app usa PKCE. Os tokens de sessão ficam no `sessionStorage`; o verificador temporário de links de e-mail fica no `localStorage` por até uma hora, permitindo abrir o link em outra aba do mesmo navegador. Ele é removido após uso/expiração e não entra no backup. A confirmação da conta também pode ser seguida de um login normal por e-mail/senha.

## 4. Publicar a função de controle de acesso

Instale/use o CLI oficial e autentique-se diretamente com o Supabase:

```sh
npx supabase login
npx supabase functions deploy access-control --project-ref SEU_PROJECT_REF --no-verify-jwt
```

O `PROJECT_REF` aparece no painel e na URL do projeto. A função valida todo token com `auth.getUser()` e usa o `session_id` do token verificado. `--no-verify-jwt` desativa somente a checagem antiga do gateway, para compatibilidade com as chaves/signaturas atuais; a verificação de autenticação dentro da função continua obrigatória.

Para incluir o navegador de desenvolvimento nas origens permitidas:

```sh
npx supabase secrets set ACCESS_ALLOWED_ORIGINS=https://rmvitor.github.io,http://localhost:5173,http://127.0.0.1:5173 --project-ref SEU_PROJECT_REF
```

O padrão permite `https://rmvitor.github.io`. Informe origens, sem caminhos ou barra final. CORS não substitui a autenticação e as regras do banco.

## 5. Conectar o aplicativo e definir o master

Para testar antes de publicar:

```sh
cp .env.example .env
# Preencha somente SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo local.
npm run dev
```

Cadastre sua conta na tela de login e confirme o e-mail. Ela ficará aguardando aprovação. No **SQL Editor**, execute uma única vez, substituindo pelo seu e-mail confirmado:

```sql
select public.bootstrap_access_master('seu-email-confirmado@empresa.com');
```

Essa operação só está disponível ao proprietário do banco/SQL Editor. Nenhuma conta pode se promover pelo aplicativo, pelo cadastro ou pela API. Há apenas um master. Depois clique em **Verificar acesso novamente** ou entre novamente para visualizar **Gestão de usuários**.

Outra opção é criar sua conta diretamente no painel Authentication do Supabase, confirmar o e-mail e então executar a mesma função. Não use um e-mail demonstrativo como master em produção.

## 6. Configurar o Pages e ativar a versão

No GitHub, abra **Settings → Secrets and variables → Actions → Variables** e crie:

- `SUPABASE_URL`: a URL HTTPS do projeto.
- `SUPABASE_PUBLISHABLE_KEY`: a chave pública publishable/anon.

São configurações públicas, não credenciais administrativas. O build rejeita chaves secretas/service_role e exige os dois valores juntos. Como alternativa, preencha `public/access-config.json` com `url` e `publishableKey`; nunca coloque segredos nesse arquivo.

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

1. Informe uma senha de pelo menos 12 caracteres e crie o backup.
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
