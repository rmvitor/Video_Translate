# Resend no Supabase: começar sem domínio

O app e suas páginas continuam em `https://rmvitor.github.io/Video_Translate/`. O domínio de envio de e-mails é uma configuração separada da hospedagem do site.

**Sem domínio próprio, use o modo de teste do Resend. Ele permite enviar somente ao e-mail associado à sua conta Resend, com o remetente `onboarding@resend.dev`. Para enviar aos usuários da plataforma, você precisará verificar um domínio que controla.** O domínio `rmvitor.github.io`, endereços Hotmail/Gmail e a URL do Supabase não substituem esse domínio de envio.

## 1. Preparar o teste

1. Crie sua conta em [Resend](https://resend.com/).
2. Escolha um e-mail de teste que você controla. Para testar um cadastro novo no Supabase, esse endereço deve ser o e-mail da conta Resend e ainda não estar cadastrado no projeto Supabase.
3. Em **API Keys**, crie uma chave com permissão de envio (**Sending access**), conforme as opções disponíveis na conta. Guarde-a no seu gerenciador de senhas; ela será usada no campo Password do SMTP do Supabase.

Se a conta Resend usar o mesmo e-mail do seu master já confirmado, você poderá testar recuperação para esse endereço, mas cadastrar novamente o master não testa confirmação de um usuário novo. Não apague nem desconfirme o master para realizar o teste. Use um endereço de teste autorizado pela conta Resend para o ciclo de cadastro.

## 2. Ligar o SMTP ao Supabase

No [projeto Supabase](https://supabase.com/dashboard/project/ntlcwlpvwkvrojodmyze/auth/smtp), abra **Authentication → SMTP Settings**, ative o SMTP personalizado e preencha:

| Campo | Valor para testes sem domínio |
| --- | --- |
| Sender name | `Entrelinhas` |
| Sender email | `onboarding@resend.dev` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | A chave de envio criada no Resend, inserida somente aqui. |

Salve. A chave Resend não é a chave publishable do Supabase nem a chave Gemini. Não coloque a chave Resend no código, no GitHub Pages, em Edge Function pública ou no chat.

Confira os parâmetros no [guia oficial de SMTP do Resend](https://resend.com/docs/send-with-smtp). Use conexão segura, conforme a configuração do provedor.

## 3. Vincular as páginas e os modelos

Siga [AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md):

- **URL Configuration:** Site URL e as cinco entradas Redirect URLs indicadas no guia.
- **Confirm signup:** assunto `Confirme seu e-mail — Entrelinhas` e HTML de [confirm-signup.html](../supabase/templates/confirm-signup.html).
- **Reset password:** assunto `Redefina sua senha — Entrelinhas` e HTML de [reset-password.html](../supabase/templates/reset-password.html).
- **Email:** confirmação ativa, mínimo de 8 caracteres e maiúscula, minúscula, número e símbolo.

O Supabase envia os e-mails pelo Resend. O aplicativo recebe os links nas páginas já publicadas e verifica os tokens com Supabase Auth. Nenhum vídeo, PDF ou backup entra nesse processo.

## 4. Fazer o teste completo

Use somente o endereço autorizado pela sua conta Resend:

1. Cadastre a conta de teste no app. Abra o e-mail enviado e clique em **Confirmar meu e-mail**. A confirmação não libera acesso automaticamente: o master ainda precisa aprovar.
2. Após a confirmação, solicite a recuperação em [Recuperar senha](https://rmvitor.github.io/Video_Translate/recuperar-senha/).
3. Abra o novo e-mail, escolha uma senha válida e salve. Entre com a nova senha.
4. Confira o evento de envio no painel **Resend → Emails/Logs** e os logs do Supabase Auth. Uma mensagem aceita para envio não garante recebimento na caixa de entrada; verifique spam e o destinatário exato.

Se o Resend informar que você só pode enviar para seu próprio endereço, é a limitação do domínio de testes. Trocar Redirect URLs não remove essa restrição. Não tente usar aliases ou outros destinatários sem autorização do provedor.

## 5. Liberar envio aos clientes depois

1. Registre um domínio próprio e tenha acesso à edição de DNS no provedor responsável por ele. O site pode continuar no GitHub Pages.
2. Em **Resend → Domains → Add domain**, adicione o domínio ou um subdomínio dedicado, por exemplo `acesso.seu-dominio.com.br`.
3. Cadastre exatamente os registros DNS fornecidos pelo Resend, com os nomes, tipos e valores exibidos no painel. Os valores de verificação são específicos do seu domínio; não há um valor fixo universal para copiar deste guia. Aguarde o status **Verified**.
4. Configure uma chave de envio autorizada para o domínio verificado. No Supabase, troque **Sender email** para um remetente nesse domínio, por exemplo `conta@acesso.seu-dominio.com.br`, e ajuste a credencial SMTP se necessário.
5. Teste entrega em outro endereço sob seu controle e confira limites, reputação e plano do provedor antes de liberar o cadastro comercial.

A configuração de SMTP, modelos e URLs exige acesso ao painel do projeto. A chave pública disponível no aplicativo não permite alterar esses itens. Estes arquivos deixam a configuração pronta para você aplicar; não indicam que o SMTP já foi ativado remotamente.
