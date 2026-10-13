import { GEMINI_ENDPOINT, textRequest, readTranslationResponse, readAnalysisResponse } from './cloud-protocol.mjs';
export type OnlineText = { id: string; original: string };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Options = { dialog: (html: string) => void; toast: (message: string) => void; isBusy: () => boolean };
export function createOnlineAssistant(options: Options) {
  let key = '', busy = false, controller: AbortController | undefined;
  const settings = document.querySelector('#online-fields')!;
  settings.innerHTML = `<p class="settings-status">Google Gemini 2.5 Flash pode traduzir e analisar somente os textos que você selecionar. Vídeos, áudio, PDFs e imagens não são enviados. O uso depende da sua chave e cota do serviço.</p><label class="field-label">Chave Gemini (somente nesta sessão)<input id="settings-gemini-key" type="password" autocomplete="off" spellcheck="false" placeholder="Informe sua chave pessoal" /></label><div class="inline-actions"><button class="button secondary" id="set-session-key">Usar nesta sessão</button><button class="text-button" id="forget-session-key">Esquecer chave</button></div><p class="settings-status" id="key-status">Nenhuma chave carregada.</p><a class="text-button" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Gerenciar chave no Google AI Studio ↗</a>`;
  const updateStatus = () => { document.querySelector('#key-status')!.textContent = key ? 'Chave disponível somente na memória desta sessão.' : 'Nenhuma chave carregada.'; };
  document.querySelector('#set-session-key')!.addEventListener('click', () => { key = (document.querySelector('#settings-gemini-key') as HTMLInputElement).value.trim(); (document.querySelector('#settings-gemini-key') as HTMLInputElement).value = ''; updateStatus(); options.toast(key ? 'Chave carregada apenas nesta sessão.' : 'Informe uma chave Gemini.'); });
  document.querySelector('#forget-session-key')!.addEventListener('click', () => { key = ''; (document.querySelector('#settings-gemini-key') as HTMLInputElement).value = ''; updateStatus(); });
  document.querySelector('#dialog')!.addEventListener('close', () => controller?.abort());
  function review(items: OnlineText[], kind: 'translate' | 'analyze', apply: (value: { id: string; translated: string }[] | string) => Promise<void>) {
    if (busy || options.isBusy()) { options.toast('Conclua ou cancele o processamento atual primeiro.'); return; }
    if (!items.length) { options.toast('Adicione ou transcreva um material para obter o texto primeiro.'); return; }
    options.dialog(`<h2>${kind === 'translate' ? 'Traduzir texto com Gemini' : 'Analisar texto com Gemini'}</h2><p>Revise o que sairá do dispositivo. Somente os textos marcados abaixo serão enviados ao Google Gemini. Os arquivos e suas imagens permanecem locais. Limite por envio: 100 trechos e 16.000 caracteres.</p><div class="inline-actions"><button class="text-button" id="select-online-all">Selecionar todos</button><button class="text-button" id="select-online-none">Desmarcar todos</button></div><label class="field-label">Chave Gemini (somente nesta sessão)<input id="review-gemini-key" type="password" autocomplete="off" spellcheck="false" placeholder="Informe sua chave pessoal" /></label><div class="online-selection">${items.map((item, index) => `<label class="online-unit"><input type="checkbox" data-online-unit="${index}" checked /><span><strong>Trecho ${index + 1}</strong><span>${esc(item.original)}</span></span></label>`).join('')}</div><label class="online-consent"><input type="checkbox" id="online-consent" /> Autorizo o envio dos textos selecionados ao Google Gemini para ${kind === 'translate' ? 'tradução' : 'análise'}.</label><p id="online-error" class="field-error" role="alert"></p><button id="send-online" class="button primary">Enviar textos selecionados</button><div id="online-result" hidden></div>`);
    (document.querySelector('#review-gemini-key') as HTMLInputElement).value = key;
    for (const action of ['all', 'none']) document.querySelector(`#select-online-${action}`)!.addEventListener('click', () => document.querySelectorAll<HTMLInputElement>('[data-online-unit]').forEach(input => { input.checked = action === 'all'; }));
    document.querySelector('#send-online')!.addEventListener('click', async () => {
      const error = document.querySelector('#online-error')!;
      error.textContent = '';
      if (!(document.querySelector('#online-consent') as HTMLInputElement).checked) { error.textContent = 'Confirme o envio dos textos selecionados antes de continuar.'; return; }
      const selected = [...document.querySelectorAll<HTMLInputElement>('[data-online-unit]:checked')].map(input => items[Number(input.dataset.onlineUnit)]);
      const secret = (document.querySelector('#review-gemini-key') as HTMLInputElement).value.trim();
      if (!secret) { error.textContent = 'Informe sua chave pessoal Gemini. Ela não será salva na biblioteca.'; return; }
      let body: ReturnType<typeof textRequest>;
      try { body = textRequest(selected, kind); } catch (err) { error.textContent = err instanceof Error ? err.message : 'Seleção inválida.'; return; }
      key = secret; updateStatus(); busy = true; controller = new AbortController();
      const cancelSignal = controller.signal;
      const send = document.querySelector<HTMLButtonElement>('#send-online')!; send.disabled = true; send.textContent = 'Consultando o Gemini…';
      try {
        const response = await fetch(GEMINI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': secret }, body: JSON.stringify(body), signal: cancelSignal });
        if (!response.ok) throw new Error(response.status === 429 ? 'Cota ou limite do Gemini atingido. Verifique seu plano e tente depois.' : `O Gemini recusou a solicitação (HTTP ${response.status}). Confira a chave, as permissões e a disponibilidade do serviço.`);
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.filter((part: { thought?: boolean; text?: string }) => !part.thought).map((part: { text?: string }) => part.text ?? '').join('');
        if (!text) throw new Error('O Gemini não retornou um texto utilizável. Nenhuma alteração foi aplicada.');
        const parsed = JSON.parse(text);
        const output = document.querySelector<HTMLElement>('#online-result')!;
        if (kind === 'translate') {
          const proposals: { id: string; translated: string }[] = readTranslationResponse(parsed, selected);
          output.innerHTML = `<h3>Revise a tradução antes de aplicar</h3>${proposals.map((proposal, index) => `<label class="field-label">Trecho ${index + 1}<textarea data-proposal="${index}" rows="3">${esc(proposal.translated)}</textarea></label>`).join('')}<button id="apply-online" class="button primary">Aplicar traduções revisadas</button>`;
          document.querySelector('#apply-online')!.addEventListener('click', async () => {
            try {
              const values = proposals.map((proposal, index) => ({ id: proposal.id, translated: (document.querySelector(`[data-proposal="${index}"]`) as HTMLTextAreaElement).value.trim() }));
              if (values.some(value => !value.translated)) throw new Error('Preencha os textos antes de aplicar.');
              await apply(values); (document.querySelector('#dialog') as HTMLDialogElement).close(); options.toast('Traduções revisadas salvas neste dispositivo.');
            } catch (err) { error.textContent = err instanceof Error ? err.message : 'Não foi possível salvar.'; }
          });
        } else {
          const analysis = readAnalysisResponse(parsed);
          output.innerHTML = `<h3>Revise a análise</h3><label class="field-label">Análise em PT-BR<textarea id="analysis-proposal" rows="12">${esc(analysis)}</textarea></label><button id="apply-online" class="button primary">Salvar análise neste material</button>`;
          document.querySelector('#apply-online')!.addEventListener('click', async () => { try { await apply((document.querySelector('#analysis-proposal') as HTMLTextAreaElement).value.trim()); (document.querySelector('#dialog') as HTMLDialogElement).close(); options.toast('Análise salva localmente. Revise as conclusões conforme o material.'); } catch { error.textContent = 'Não foi possível salvar a análise.'; } });
        }
        output.hidden = false; send.hidden = true;
      } catch (err) {
        if (!cancelSignal.aborted) error.textContent = err instanceof SyntaxError ? 'A resposta não teve o formato esperado. Nada foi aplicado.' : err instanceof Error ? err.message : 'Não foi possível acessar o Gemini. Confira sua conexão.';
      } finally { busy = false; controller = undefined; send.disabled = false; send.textContent = 'Enviar textos selecionados'; }
    });
  }
  return {
    get busy() { return busy; },
    translate: (items: OnlineText[], apply: (values: { id: string; translated: string }[]) => Promise<void>) => review(items, 'translate', value => apply(value as { id: string; translated: string }[])),
    analyze: (items: OnlineText[], save: (value: string) => Promise<void>) => review(items, 'analyze', value => save(value as string)),
  };
}
