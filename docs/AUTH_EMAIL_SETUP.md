# Vincular confirmação de e-mail e recuperação de senha

Este guia usa o projeto Supabase **ntlcwlpvwkvrojodmyze** e o Entrelinhas já publicado em **https://rmvitor.github.io/Video_Translate/**. Não é necessário recriar banco, master ou função de controle de acesso para configurar os e-mails.

Em 15/10/2026, a consulta pública ao Auth confirmou login por e-mail ativo, cadastro ativo e confirmação de e-mail obrigatória (`mailer_autoconfirm: false`). As três páginas abaixo responderam HTTP 200. Essa consulta não informa SMTP, templates ou a lista de redirecionamentos; esses itens precisam ser conferidos no painel.

## 1. Cadastrar as URLs

Abra [Authentication → URL Configuration](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/auth/url-configuration).

Em **Site URL**, salve exatamente:

```text
https://rmvitor.github.io/Video_Translate/
```

Em **Redirect URLs**, adicione cada endereço como uma entrada separada e salve:

```text
https://rmvitor.github.io/Video_Translate/
https://rmvitor.github.io/Video_Translate/nova-senha/
https://rmvitor.github.io/Video_Translate/nova-senha/**
https://rmvitor.github.io/Video_Translate/confirmar-email/
https://rmvitor.github.io/Video_Translate/confirmar-email/**
```

As variantes `/**` também cobrem parâmetros utilizados pelo fluxo PKCE do SDK. Mantenha o prefixo `/Video_Translate/` e as barras finais.

| Página | Finalidade |
| --- | --- |
| [Recuperar senha](https://rmvitor.github.io/Video_Translate/recuperar-senha/) | Formulário para pedir o e-mail. |
| [Nova senha](https://rmvitor.github.io/Video_Translate/nova-senha/) | Recebe o link de recuperação, valida a sessão e salva a nova senha. Abrir esta URL sem um link/sessão válida não libera a alteração. |
| [Confirmar e-mail](https://rmvitor.github.io/Video_Translate/confirmar-email/) | Recebe o link do cadastro e confirma a conta. Sem um link, mostra a opção de reenviar. |

Essas páginas pertencem ao **GitHub Pages**. O Supabase verifica o token recebido e mantém a conta autenticada; os arquivos de treinamento continuam locais.

## 2. Escolher o envio padrão ou os modelos personalizados

### Sem SMTP próprio: usar os e-mails padrão

Se o painel mostrar **“Set up custom SMTP to edit templates”**, os campos **Subject** e **Body** ficam bloqueados até habilitar SMTP próprio. Trocar de **Preview** para **Source** não remove esse bloqueio. Nesse caso, mantenha o conteúdo padrão: ele já inclui o link de verificação do Supabase. Não é necessário editar templates para testar recuperação e confirmação com as páginas do app.

Configure as URLs da etapa 1 e mantenha **Confirm email** ativo na etapa 3. O app informa `/nova-senha/` ao pedir recuperação e `/confirmar-email/` ao cadastrar ou reenviar a confirmação. O botão do e-mail padrão passa pela verificação do Supabase e volta para a página correspondente com o código de autorização. Para o fluxo PKCE, abra esse botão no **mesmo navegador e perfil** em que solicitou o pedido. Um PWA em um navegador e o e-mail aberto em outro navegador/perfil podem não compartilhar o verificador.

Se o e-mail ainda aponta para `localhost:3000`, confira Site URL e Redirect URLs e solicite um novo e-mail pelo app. Alterar configurações não reescreve mensagens já enviadas. Um botão contendo somente a URL de `/nova-senha/`, sem código, token ou sessão, não autoriza alterar a senha; a tela explica a ausência de sessão. O envio padrão tem limitações de destinatários e volume: o fato de chegar ao master não garante envio a todos os clientes.

### Com SMTP próprio: personalizar os dois modelos

Primeiro configure e salve o SMTP da etapa 4. Só depois substitua os templates abaixo. Sem domínio próprio, o Resend permite o teste restrito descrito em [RESEND_SETUP.md](RESEND_SETUP.md), não o envio livre aos clientes.

Abra [Authentication → Email Templates](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/auth/templates). Dependendo da versão do painel, os modelos aparecem em **Authentication → Emails**.

| Modelo no Supabase | Assunto sugerido | Conteúdo a colar |
| --- | --- | --- |
| **Confirm signup** | `Confirme seu e-mail — Entrelinhas` | Todo o HTML de [confirm-signup.html](../supabase/templates/confirm-signup.html). |
| **Reset password** | `Redefina sua senha — Entrelinhas` | Todo o HTML de [reset-password.html](../supabase/templates/reset-password.html). |

Abra cada arquivo, copie seu conteúdo completo para o campo **Body / HTML** do modelo correspondente e salve. Mantenha `{{ .TokenHash }}` exatamente como está; o Supabase substitui esse marcador por um token de uso único em cada envio.

Os botões dos arquivos preparados já apontam para:

```html
<!-- Confirm signup -->
https://rmvitor.github.io/Video_Translate/confirmar-email/?token_hash={{ .TokenHash }}&amp;type=signup

<!-- Reset password -->
https://rmvitor.github.io/Video_Translate/nova-senha/?token_hash={{ .TokenHash }}&amp;type=recovery
```

`&amp;` é a codificação correta dentro do atributo HTML `href`. Não substitua o token por uma chave de API, senha, e-mail ou um valor fixo. Não use apenas a URL da página como botão do e-mail: falta o token para validá-la.

O app já usa `verifyOtp` para esses links, inclusive se o e-mail for aberto em outro navegador/dispositivo. Os modelos padrão com `{{ .ConfirmationURL }}` também são compatíveis, com a exigência de navegador/perfil do PKCE descrita acima. Links já enviados continuam seguindo o template antigo; solicite um novo após salvar.

### Entender uma falha sem expor o link

O app diferencia a página aberta sem sessão, o verificador ausente no navegador, a recusa/expiração informada pelo Supabase e uma falha de conexão/serviço. Apenas a descrição da tela não prova que o prazo acabou. Na confirmação de e-mail, uma falha continua oferecendo reenvio; uma sessão já aberta não é usada para aprovar um callback inválido.

Um link pode ser recusado por já ter sido utilizado, inclusive após uma verificação automática feita por um sistema de e-mail. Esse comportamento precisa ser confirmado nos logs do Auth; a presença de Outlook Safe Links, sozinha, não comprova consumo do token. Nunca compartilhe o link completo, `code`, tokens ou fragmentos de sessão ao pedir diagnóstico. Informe somente a mensagem exibida e o domínio/caminho de destino.

## 3. Conferir as regras de conta

Em **Authentication → Sign In / Providers → Email**:

- Mantenha login por e-mail e **Confirm email** ativos.
- Mínimo de **8 caracteres**.
- Composição **Lowercase, uppercase letters, digits and symbols**.
- Confira o prazo de expiração dos links na seção de e-mails/OTP. Os textos dos modelos não prometem um prazo fixo, para acompanhar essa configuração.

A confirmação do e-mail não aprova o acesso comercial. Novas contas continuam aguardando liberação pelo master. Recuperar senha não altera bloqueios, validade do acesso ou assinatura.

## 4. Configurar o envio SMTP

Para começar com Resend sem um domínio próprio, use o [guia de teste com Resend](RESEND_SETUP.md). Ele limita o destinatário ao endereço da conta Resend. Esse modo não permite enviar livremente aos clientes.

Abra [Authentication → SMTP Settings](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/auth/smtp). O envio padrão do Supabase serve para testes e tem restrições de destinatários e volume. Para enviar aos clientes, configure SMTP próprio.

Preencha com os dados fornecidos pelo seu provedor:

| Campo | Valor |
| --- | --- |
| Sender name | `Entrelinhas` |
| Sender email | Um endereço autorizado no seu domínio, como `acesso@seu-dominio.com.br`. |
| Host | Servidor SMTP do provedor. |
| Port | Porta SMTP segura indicada pelo provedor. |
| Username | Usuário SMTP. |
| Password | Credencial SMTP, inserida somente no painel do Supabase. |

Se escolher **Resend**, primeiro adicione e verifique seu domínio no serviço, configurando os registros DNS solicitados. Os parâmetros usuais são host `smtp.resend.com`, porta `465`, usuário `resend` e a chave de envio do Resend no campo Password; confirme os dados e permissões no painel do provedor. O remetente precisa pertencer ao domínio autorizado. Confira também [a integração oficial](https://supabase.com/docs/guides/auth/auth-smtp).

Não cole credenciais SMTP no repositório, no aplicativo ou no chat. O app continua usando somente a chave pública Supabase. Desative rastreamento que reescreva links de autenticação caso o provedor o habilite; isso evita interferência na validação.

## 5. Testar depois de salvar

1. Em **Solicitar acesso**, faça um cadastro com um e-mail de teste que você controla. Abra o novo e-mail e use **Confirmar meu e-mail**. O app deve informar a confirmação; a conta deve aparecer confirmada no Supabase e continuar pendente da aprovação do master.
2. Em **Esqueci minha senha**, informe uma conta de teste existente. Abra o novo e-mail e use **Criar nova senha**. O formulário deve mostrar os requisitos e a confirmação da senha.
3. Salve uma senha válida e entre com ela. A senha anterior não deve mais funcionar. Permissões e materiais locais permanecem associados à mesma conta.
4. Confira que um link já utilizado ou expirado oferece solicitar outro. Com os templates de token hash, confira também a abertura em outro navegador.

Se o e-mail não chegar, confira spam, remetente autorizado, registros de envio no provedor, logs do Auth e limites de envio. A mensagem genérica de recuperação do app não confirma que uma conta exista ou que a mensagem tenha chegado à caixa de entrada. Se o botão abrir a página errada, reveja Site URL, Redirect URLs e o template, e solicite um link novo.

Os testes automatizados validam o SDK, as páginas e o token hash com respostas simuladas; não enviam e-mails reais nem alteram senhas de usuários reais. A validação final de entrega depende das configurações salvas no seu projeto e de um e-mail de teste sob seu controle.
