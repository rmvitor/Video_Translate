// Only curated explanations and reference codes reach the screen. Auth error
// messages can contain addresses, provider diagnostics or database details.
const messages = {
  email_address_not_authorized: 'O serviço de e-mail do aplicativo não está autorizado a enviar para este destinatário. Entre em contato com o administrador para configurar o envio.',
  over_email_send_rate_limit: 'O limite de envio de e-mails foi atingido. Aguarde a liberação da cota antes de reenviar. Se persistir, entre em contato com o administrador.',
  over_request_rate_limit: 'O limite de solicitações do serviço foi atingido. Aguarde antes de tentar novamente.',
  signup_disabled: 'Novos cadastros estão temporariamente indisponíveis. Entre em contato com o administrador.',
  email_provider_disabled: 'O acesso por e-mail está temporariamente indisponível. Entre em contato com o administrador.',
  captcha_failed: 'Não foi possível concluir a verificação de segurança. Entre em contato com o administrador.',
  email_address_invalid: 'O serviço de cadastro recusou o formato do e-mail. Confira o endereço informado.',
  weak_password: 'A senha foi recusada pela política de segurança do serviço. Escolha uma senha diferente, mesmo que todos os requisitos locais estejam atendidos.',
  validation_failed: 'O serviço não conseguiu validar os dados da solicitação. Confira os campos e tente novamente.',
};

export function authRequestError(error, operation = 'signup') {
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : undefined;
  const suppliedCode = error?.code;
  let code = Object.hasOwn(messages, suppliedCode) ? suppliedCode : 'unknown_error';
  let message = messages[code];
  if (code === 'weak_password' && Array.isArray(error?.reasons) && error.reasons.includes('pwned')) message = 'Essa senha foi identificada em vazamentos de dados. Escolha uma senha exclusiva e diferente, mesmo que ela atenda aos requisitos de composição.';
  if (code === 'unknown_error' && status === 429) {
    code = 'rate_limit'; message = messages.over_request_rate_limit;
  }
  if (!message && /^Error sending (?:confirmation|recovery|magic link|email)/i.test(String(error?.message || ''))) {
    code = 'email_delivery_failed'; message = 'Não foi possível enviar o e-mail de confirmação ou recuperação. O administrador precisa conferir o serviço de envio e os logs do Auth.';
  }
  if (!message && /^Database error (?:saving|creating|updating) (?:new )?user/i.test(String(error?.message || ''))) {
    code = 'registration_service_error'; message = 'O serviço encontrou um erro ao registrar a conta. Entre em contato com o administrador para conferir os logs do cadastro.';
  }
  if (!message && (error?.name === 'AuthRetryableFetchError' || error?.name === 'TimeoutError' || error?.name === 'AbortError')) {
    code = 'connection_error'; message = 'Não foi possível conectar ao serviço de acesso. Confira a conexão e tente novamente.';
  }
  if (!message && (status >= 500 || suppliedCode === 'unexpected_failure')) {
    code = 'service_unavailable'; message = 'O serviço de acesso não conseguiu concluir a solicitação. Tente novamente mais tarde; se persistir, informe a referência ao administrador.';
  }
  if (!message) message = operation === 'signup' ? 'Não foi possível concluir o cadastro. Tente novamente ou informe a referência ao administrador.' : 'Não foi possível concluir a solicitação por e-mail. Aguarde antes de tentar novamente ou informe a referência ao administrador.';
  return `${message} Referência: ${code}${status ? ` · HTTP ${status}` : ''}.`;
}
