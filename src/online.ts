import { GEMINI_ENDPOINT, GEMINI_MODELS_ENDPOINT, geminiEndpoint, availableTextModels, preferredTextModel, geminiError, textRequest, readTranslationResponse, readAnalysisResponse } from './cloud-protocol.mjs';
export type OnlineText = { id: string; original: string };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Options = { dialog: (html: string) => void; toast: (message: string) => void; isBusy: () => boolean };
export function createOnlineAssistant(options: Options) {
  let key = '', busy = false, controller: AbortController | undefined;
  let model = '', automaticModel = '', catalogue: {id:string;name:string}[] = [];
  let catalogueController:AbortController|undefined;
  const settings = document.querySelector('#online-fields')!;
  // A restricted browser key needs a referrer. Send only the public origin,
  // never an Auth callback URL, query, fragment, project or filename.
  const originReferrer:Pick<RequestInit,'referrer'|'referrerPolicy'> = {referrer:new URL('/',location.href).href,referrerPolicy:'origin'};
  const providerError=async(response:Response)=>geminiError(response.status,await response.json().catch(()=>({})));
  settings.innerHTML = `<p class="settings-status">Google Gemini pode traduzir e analisar somente os textos que você selecionar. Vídeos, áudio, PDFs e imagens não são enviados. O uso depende da sua chave e cota do serviço.</p><label class="field-label">Chave Gemini (somente nesta sessão)<input id="settings-gemini-key" type="password" autocomplete="off" spellcheck="false" placeholder="Informe sua chave pessoal" /></label><div class="inline-actions"><button class="button secondary" id="set-session-key">Usar nesta sessão</button><button class="text-button" id="forget-session-key">Esquecer chave</button></div><p class="settings-status" id="key-status">Nenhuma chave carregada.</p><a class="text-button" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Gerenciar chave no Google AI Studio ↗</a>`;
  settings.insertAdjacentHTML('beforeend', `<label class="field-label">Modelo Gemini<select id="gemini-model"><option value="">Automático</option></select></label><button class="button secondary" id="check-gemini-models">Verificar chave e modelos</button><p class="settings-status" id="gemini-model-status" role="status">A consulta verifica os modelos disponíveis na sua chave, sem enviar textos.</p>`);
  settings.insertAdjacentHTML('beforeend', `<details class="material-more"><summary>Como configurar e resolver erros</summary><ol><li>Crie uma chave de API no Google AI Studio para o seu projeto.</li><li>Informe a chave acima e clique em Verificar chave e modelos. Escolha um modelo de texto disponível.</li><li>No vídeo, transcreva o áudio primeiro. Em vídeo ou PDF, escolha Traduzir com Gemini, revise os trechos e autorize o envio.</li><li>Revise a resposta antes de aplicar. A chave é esquecida ao sair da conta ou fechar o aplicativo.</li></ol><p><strong>HTTP 403:</strong> confira a Generative Language API e as restrições da chave. Para este site, permita <code>https://rmvitor.github.io/*</code>. A consulta envia apenas a origem pública como referência, sem o caminho ou dados da conta.</p><p>Alguns modelos oferecem cota gratuita, conforme região e projeto; outros exigem faturamento. A assinatura do aplicativo Gemini não substitui a configuração da API. HTTP 429 indica limite de uso. Verificar modelos não garante cota para gerar respostas.</p><p>Texto interno também pode ser confidencial. Confira a política da empresa e os termos de uso de dados do plano escolhido antes de enviar.</p><a class="text-button" href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">Cotas e preços ↗</a> <a class="text-button" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Termos de uso de dados ↗</a></details>`);
  const updateStatus = () => { document.querySelector('#key-status')!.textContent = key ? 'Chave disponível somente na memória desta sessão.' : 'Nenhuma chave carregada.'; };
  const modelOptions=()=>`<option value="">Automático · ${esc(automaticModel||'gemini-2.5-flash')}</option>${catalogue.map(item=>`<option value="${esc(item.id)}">${item.name===item.id?esc(item.id):`${esc(item.name)} · ${esc(item.id)}`}</option>`).join('')}`;
  const updateModelStatus=()=>{const status=document.querySelector('#online-model-status');if(status)status.textContent=`Modelo em uso: ${model||automaticModel||'gemini-2.5-flash'}.`;};
  const renderModels = () => {
    document.querySelectorAll<HTMLSelectElement>('#gemini-model, #review-gemini-model').forEach(select=>{select.innerHTML=modelOptions();select.value=model;});
    updateModelStatus();
  };
  const chooseModel=(event:Event)=>{model=(event.target as HTMLSelectElement).value;document.querySelectorAll<HTMLSelectElement>('#gemini-model, #review-gemini-model').forEach(select=>select.value=model);updateModelStatus();};
  const clearModels=()=>{catalogueController?.abort();model='';automaticModel='';catalogue=[];renderModels();document.querySelector('#gemini-model-status')!.textContent='A consulta verifica os modelos disponíveis na sua chave, sem enviar textos.';};
  async function loadModels(secret:string, signal?:AbortSignal) {
    const found:{id:string;name:string}[]=[];let page='';
    for(let count=0;count<5;count++) {
      const url=new URL(GEMINI_MODELS_ENDPOINT);url.searchParams.set('pageSize','100');if(page)url.searchParams.set('pageToken',page);
      const response=await fetch(url,{...originReferrer,headers:{'X-Goog-Api-Key':secret},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(await providerError(response));
      const data=await response.json();found.push(...availableTextModels(data));page=typeof data.nextPageToken==='string'?data.nextPageToken:'';if(!page)break;
    }
    if(!found.length)throw new Error('Nenhum modelo Gemini de texto disponível nesta chave. Confira o projeto e as permissões no Google AI Studio.');
    if(key!==secret)throw new DOMException('Consulta cancelada.','AbortError');
    catalogue=found;automaticModel=preferredTextModel(catalogue)?.id||'';renderModels();return found;
  }
  document.querySelector('#gemini-model')!.addEventListener('change',chooseModel);
  document.querySelector('#check-gemini-models')!.addEventListener('click',async()=>{
    const input=document.querySelector<HTMLInputElement>('#settings-gemini-key')!,status=document.querySelector('#gemini-model-status')!,button=document.querySelector<HTMLButtonElement>('#check-gemini-models')!;
    if(input.value.trim()){clearModels();key=input.value.trim();input.value='';updateStatus();}
    if(!key){status.textContent='Informe a chave Gemini antes de verificar.';return;}
    if(busy)return;button.disabled=true;status.textContent='Consultando os modelos disponíveis…';
    const secret=key;catalogueController=new AbortController();
    try{const found=await loadModels(secret,catalogueController.signal);if(key!==secret)return;status.textContent=`Chave aceita para consultar: ${found.length} modelos de texto disponíveis. Automático: ${automaticModel}. A geração depende das permissões e cotas do projeto.`;}
    catch(err){if(key===secret)status.textContent=err instanceof Error?err.message:'Não foi possível consultar os modelos.';}
    finally{button.disabled=false;}
  });
  document.querySelector('#set-session-key')!.addEventListener('click', () => { clearModels();key = (document.querySelector('#settings-gemini-key') as HTMLInputElement).value.trim(); (document.querySelector('#settings-gemini-key') as HTMLInputElement).value = ''; updateStatus(); options.toast(key ? 'Chave carregada apenas nesta sessão.' : 'Informe uma chave Gemini.'); });
  document.querySelector('#forget-session-key')!.addEventListener('click', () => { key = ''; clearModels();(document.querySelector('#settings-gemini-key') as HTMLInputElement).value = ''; updateStatus(); });
  document.querySelector('#dialog')!.addEventListener('close', () => controller?.abort());
  function review(items: OnlineText[], kind: 'translate' | 'analyze', apply: (value: { id: string; translated: string }[] | string) => Promise<void>) {
    if (busy || options.isBusy()) { options.toast('Conclua ou cancele o processamento atual primeiro.'); return; }
    if (!items.length) { options.toast('Adicione ou transcreva um material para obter o texto primeiro.'); return; }
    options.dialog(`<h2>${kind === 'translate' ? 'Traduzir texto com Gemini' : 'Analisar texto com Gemini'}</h2><p>Revise o que sairá do dispositivo. Somente os textos marcados abaixo serão enviados ao Google Gemini. Os arquivos e suas imagens permanecem locais. Limite por envio: 100 trechos e 16.000 caracteres.</p><div class="inline-actions"><button class="text-button" id="select-online-all">Selecionar todos</button><button class="text-button" id="select-online-none">Desmarcar todos</button></div><label class="field-label">Chave Gemini (somente nesta sessão)<input id="review-gemini-key" type="password" autocomplete="off" spellcheck="false" placeholder="Informe sua chave pessoal" /></label><div class="online-selection">${items.map((item, index) => `<label class="online-unit"><input type="checkbox" data-online-unit="${index}" checked /><span><strong>Trecho ${index + 1}</strong><span>${esc(item.original)}</span></span></label>`).join('')}</div><label class="online-consent"><input type="checkbox" id="online-consent" /> Autorizo o envio dos textos selecionados ao Google Gemini para ${kind === 'translate' ? 'tradução' : 'análise'}.</label><p id="online-error" class="field-error" role="alert"></p><button id="send-online" class="button primary">Enviar textos selecionados</button><div id="online-result" hidden></div>`);
    (document.querySelector('#review-gemini-key') as HTMLInputElement).value = key;
    document.querySelector('#review-gemini-key')!.closest('label')!.insertAdjacentHTML('afterend',`<label class="field-label">Modelo de texto<select id="review-gemini-model" aria-describedby="online-model-status">${modelOptions()}</select></label><p class="settings-status" id="online-model-status" role="status"></p><p class="settings-status">Cotas e custos variam por modelo. Atualize a lista nas Preferências.</p>`);
    const modelChoice=document.querySelector<HTMLSelectElement>('#review-gemini-model')!;modelChoice.value=model;modelChoice.addEventListener('change',chooseModel);updateModelStatus();
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
      if(key!==secret){clearModels();}
      key = secret; updateStatus(); busy = true; controller = new AbortController();
      const cancelSignal = controller.signal;
      const send = document.querySelector<HTMLButtonElement>('#send-online')!; send.disabled = true; send.textContent = 'Consultando o Gemini…';
      modelChoice.disabled=true;let temporaryFailure=false;
      try {
        const chosen=model||automaticModel;
        const request=(selected:string)=>{document.querySelector('#online-model-status')!.textContent=`Consultando o modelo ${selected||'gemini-2.5-flash'}…`;return fetch(selected?geminiEndpoint(selected):GEMINI_ENDPOINT,{...originReferrer,method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':secret},body:JSON.stringify(body),signal:AbortSignal.any([cancelSignal,AbortSignal.timeout(90000)])});};
        let response=await request(chosen);
        if(response.status===404&&!model){
          send.textContent='Buscando um modelo disponível…';
          const available=await loadModels(secret,cancelSignal),fallback=preferredTextModel(available,chosen||'gemini-2.5-flash');
          if(!fallback)throw new Error(geminiError(404));automaticModel=fallback.id;renderModels();response=await request(fallback.id);
        }
        if (!response.ok) {temporaryFailure=[502,503,504].includes(response.status);throw new Error(await providerError(response));}
        const result = await response.json();
        if(cancelSignal.aborted)return;
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
      } finally { busy = false; controller = undefined; send.disabled = false;send.textContent=temporaryFailure?'Tentar novamente':'Enviar textos selecionados';modelChoice.disabled=send.hidden;updateModelStatus(); }
    });
  }
  return {
    get busy() { return busy; },
    reset: () => { key = ''; clearModels();controller?.abort(); const review = document.querySelector<HTMLInputElement>('#review-gemini-key'); if (review) review.value = ''; updateStatus(); (document.querySelector('#settings-gemini-key') as HTMLInputElement).value = ''; },
    translate: (items: OnlineText[], apply: (values: { id: string; translated: string }[]) => Promise<void>) => review(items, 'translate', value => apply(value as { id: string; translated: string }[])),
    analyze: (items: OnlineText[], save: (value: string) => Promise<void>) => review(items, 'analyze', value => save(value as string)),
  };
}
