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

## 2. Colar os dois modelos de e-mail

Abra [Authentication → Email Templates](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/auth/templates). Dependendo da versão do painel, os modelos aparecem em **Authentication → Emails**.

| Modelo no Supabase | Assunto sugerido | Conteúdo a colar |
| --- | --- | --- |
| **Confirm signup** | `Confirme seu e-mail — Entrelinhas` | Todo o HTML de [confirm-signup.html](../supabase/templates/confirm-signup.html). |
| **Reset password** | `Redefina sua senha — Entrelinhas` | Todo o HTML de [reset-password.html](../supabase/templates/reset-password.html). |

Abra cada arquivo, copie seu conteúdo completo para o campo **Body / HTML** do modelo correspondente e salve. Mantenha `{{ .TokenHash }}` exatamente como está; o Supabase substitui esse marcador por um token de uso único em cada envio.

Os botões já apontam para:

```html
<!-- Confirm signup -->
https://rmvitor.github.io/Video_Translate/confirmar-email/?token_hash={{ .TokenHash }}&amp;type=signup

<!-- Reset password -->
https://rmvitor.github.io/Video_Translate/nova-senha/?token_hash={{ .TokenHash }}&amp;type=recovery
```

`&amp;` é a codificação correta dentro do atributo HTML `href`. Não substitua o token por uma chave de API, senha, e-mail ou um valor fixo. Não use apenas a URL da página como botão do e-mail: falta o token para validá-la.

O app já usa `verifyOtp` para esses links, inclusive se o e-mail for aberto em outro navegador/dispositivo. Os modelos padrão com `{{ .ConfirmationURL }}` também são compatíveis, mas o fluxo PKCE precisa do navegador que solicitou o link. Use os modelos acima para esta configuração. Links já enviados continuam seguindo o template antigo; solicite um novo após salvar.

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
