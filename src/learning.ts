import type { Assignment, LearningProject, PdfDocument, Project, WorkerEvent } from './types';
import { listCollections, listDocuments, listProjects, saveCollection, saveDocument, saveProject, saveMaterials, deleteCollection, deleteDocument } from './storage';
import { extractPdf } from './pdf';
import { LocalNarrator } from './narration';
import type { createOnlineAssistant } from './online';
import { LANGUAGES } from './preferences.mjs';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
type Options = {
  toast: (message: string) => void; icons: () => void; dialog: (html: string) => void;
  accountEpoch: () => number; currentView: () => string; online: ReturnType<typeof createOnlineAssistant>;
  changeView: (name: string) => void; isBusy: () => boolean; stopMedia: () => void;
  narrator: LocalNarrator; openVideo: (id: string) => Promise<void>;
  addVideo: (assignment: Assignment) => void;
  currentVideo: () => Project | undefined; refreshVideos: () => Promise<void>;
  assignVideo: (assignment: Assignment) => Promise<void>;
  deleteVideo: (id:string) => Promise<void>;
};

export function createLearningArea(options: Options) {
  let collections: LearningProject[] = [], documents: PdfDocument[] = [], videos: Project[] = [];
  let selectedCollection: string | undefined, selectedSubject = '';
  let current: PdfDocument | undefined;
  let busy = false, pdfWorker: Worker | undefined, abort: AbortController | undefined;
  let importAssignment: Assignment = {};
  let urls: string[] = [];
  let saveQueue = Promise.resolve();
  let operation = 0;
  let activeMaterial: { id: string; kind: 'video' | 'pdf' } | undefined;
  const notesUI=new Map<string,{open:boolean;draft:string}>(),readerUI=new Map<string,boolean>();
  const makeURL = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.push(url); return url; };

  $('main').insertAdjacentHTML('beforeend', `
    <section id="collections-view" hidden><div class="page-heading" id="collections-home-heading"><div><div class="eyebrow">TUDO NO SEU LUGAR</div><h1>Projetos e assuntos<span>.</span></h1><p>Organize vídeos e páginas de leitura do seu jeito, neste dispositivo.</p></div><button class="button primary" id="new-collection">${icon('plus')}Criar projeto</button></div><div id="collection-content"></div></section>
    <section id="documents-view" hidden><div class="page-heading"><div><div class="eyebrow">LEIA NO SEU IDIOMA</div><h1>Páginas traduzidas<span>.</span></h1><p>O texto em português, com as imagens do seu PDF.</p></div><button class="button primary" id="add-pdf">${icon('plus')}Adicionar PDF</button></div><div class="library-notice">${icon('shield-check')}Texto e imagens ficam neste navegador. O PDF é lido localmente; o Gemini recebe somente o texto selecionado, após sua autorização.</div><div id="pdf-progress" class="pdf-progress" hidden aria-live="polite"><strong id="pdf-progress-label">Preparando…</strong><button class="text-button" id="cancel-pdf">Cancelar</button></div><div id="pdf-error" class="error-panel" hidden role="alert"></div><div id="pdf-list" class="library-grid"></div><div id="pdf-reader" hidden></div></section>
    <input id="pdf-input" type="file" accept="application/pdf,.pdf" hidden />
  `);
  $('.player-info').insertAdjacentHTML('afterend', `<div id="video-organization" class="organization-bar"></div>`);
  const videoSettings=document.createElement('details');videoSettings.className='material-settings';videoSettings.id='video-settings';
  videoSettings.innerHTML='<summary>Organização, idioma e voz</summary>';
  $('.player-info').after(videoSettings);
  const source=$('#workspace-view .source-settings'),voices=$('#workspace-view .voice-controls');
  const onlineActions=source.querySelector('.inline-actions')!;$('.process-area').before(onlineActions);onlineActions.classList.add('quick-translations');
  videoSettings.append($('#video-organization'),source,voices);
  voices.insertAdjacentHTML('beforeend','<button type="button" class="button secondary" data-prepare-voice>Preparar voz natural</button><span class="voice-note" data-voice-status></span>');

  const portalNodes = ['workspace-view', 'pdf-reader', 'pdf-progress', 'pdf-error'].map(id => {
    const node = $(`#${id}`), home = document.createComment(`${id}-home`); node.before(home); return { node, home };
  });
  function restorePortals() { for (const { node, home } of portalNodes) { home.after(node); if (node.id === 'workspace-view') node.hidden = options.currentView() !== 'workspace'; } }
  function mountMaterial() {
    if (options.currentView() !== 'collections' || !activeMaterial) return;
    const outlet = $('#project-outlet'); if (!outlet) return;
    const ids = activeMaterial.kind === 'video' ? ['workspace-view'] : ['pdf-progress', 'pdf-error', 'pdf-reader'];
    for (const { node } of portalNodes) if (ids.includes(node.id)) { outlet.append(node); if (node.id === 'workspace-view') node.hidden = false; }
  }
  const orderedMaterials = () => {
    const collection = selected(); if (!collection) return [];
    const all = [...videos.map(value => ({ value, kind: 'video' as const })), ...documents.map(value => ({ value, kind: 'pdf' as const }))].filter(m => m.value.collectionId === collection.id).sort((a, b) => (a.value.sortOrder ?? a.value.createdAt) - (b.value.sortOrder ?? b.value.createdAt));
    return [...collection.subjects.flatMap(subject => all.filter(m => m.value.subjectId === subject.id)), ...all.filter(m => !collection.subjects.some(subject => subject.id === m.value.subjectId))];
  };
  async function openMaterial(id: string, kind: 'pdf' | 'video') {
    if (!guard()) return;
    selectedSubject = orderedMaterials().find(m => m.value.id === id)?.value.subjectId || '__none';
    if (kind === 'pdf') { await openPdf(id, true); }
    else {
      if (options.currentVideo()?.id !== id) await options.openVideo(id);
      else options.stopMedia();
      activeMaterial = { id, kind }; options.changeView('collections');
    }
    const collection = selected();
    if (collection) { collection.lastMaterialId = id; await saveCollection(collection); }
    renderCollections();
  }
  const guard = () => {
    if (busy || options.isBusy()) { options.toast('Conclua ou cancele o processamento atual primeiro.'); return false; }
    return true;
  };
  const selected = () => collections.find(c => c.id === selectedCollection);
  const assignment = (): Assignment => ({ collectionId: selectedCollection, subjectId: selectedSubject && selectedSubject !== '__none' ? selectedSubject : undefined,sortOrder:Math.max(0,...[...videos,...documents].filter(m=>m.collectionId===selectedCollection).map(m=>m.sortOrder??m.createdAt))+1 });
  function selectors(value: Assignment, prefix: string) {
    const collection = collections.find(c => c.id === value.collectionId);
    return `<label>Projeto<select id="${prefix}-collection" aria-label="Projeto do ${prefix === 'pdf' ? 'PDF' : 'vídeo'}"><option value="">Sem projeto</option>${collections.map(c => `<option value="${c.id}" ${c.id === value.collectionId ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label><label>Subassunto<select id="${prefix}-subject" aria-label="Subassunto do ${prefix === 'pdf' ? 'PDF' : 'vídeo'}" ${!collection ? 'disabled' : ''}><option value="">Sem subassunto</option>${(collection?.subjects ?? []).map(s => `<option value="${s.id}" ${s.id === value.subjectId ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>`;
  }
  function renderVideoOrganization() {
    const video = options.currentVideo();
    $('#video-organization').innerHTML = video ? selectors(video, 'video') : '';
    $('#video-organization').hidden = !video;
    $('#video-organization').querySelectorAll('select').forEach(select => select.toggleAttribute('disabled', busy || options.isBusy() || (select.id === 'video-subject' && !video?.collectionId)));
  }
  async function refresh() {
    const epoch = options.accountEpoch();
    try { const values = await Promise.all([listCollections(), listDocuments(), listProjects()]); if (epoch !== options.accountEpoch()) return; [collections, documents, videos] = values; }
    catch { options.toast('Não foi possível carregar todos os materiais locais.'); }
    collections.sort((a, b) => b.createdAt - a.createdAt); documents.sort((a, b) => b.createdAt - a.createdAt);
    if (!busy && current) current = documents.find(d => d.id === current!.id) ?? current;
    renderCollections(); renderDocumentList(); renderVideoOrganization();
  }
  function materialCard(material: Project | PdfDocument, kind: 'video' | 'pdf') {
    return `<article class="material-card ${activeMaterial?.id === material.id ? 'is-active' : ''}"><button class="outline-material" data-material="${material.id}" data-kind="${kind}" ${activeMaterial?.id === material.id ? 'aria-current="page"' : ''}><span class="completion-marker ${material.completedAt ? 'completed' : ''}">${material.completedAt ? icon('check') : ''}</span>${icon(kind === 'pdf' ? 'file-text' : 'file-video')}<span>${esc(material.title)}<small>${kind === 'pdf' ? `${(material as PdfDocument).pages.length} páginas` : 'Vídeo'}${material.completedAt ? ' · Concluído' : ''}</small></span></button><div class="outline-actions"><button class="icon-button" data-move-material="${material.id}" data-kind="${kind}" aria-label="Mover ${esc(material.title)}">${icon('arrow-up-right')}</button><button class="icon-button" data-remove-material="${material.id}" data-kind="${kind}" aria-label="Excluir ${esc(material.title)}">${icon('trash-2')}</button></div></article>`;
  }
  function renderCollections() {
    const content=$('#collection-content'),previous=content.dataset.projectId,notes=content.querySelector<HTMLDetailsElement>('.project-notes'),draft=content.querySelector<HTMLTextAreaElement>('#project-notes');
    if(previous&&notes&&draft)notesUI.set(previous,{open:notes.open,draft:draft.value});
    restorePortals();
    const collection = selected();
    content.dataset.projectId=collection?.id||'';
    $('#collections-home-heading').hidden=Boolean(collection);$('#collections-view').classList.toggle('project-open',Boolean(collection));
    if (!collection) {
      $('#collection-content').innerHTML = collections.length ? `<div class="collection-grid">${collections.map(c => {
        const items = [...videos, ...documents].filter(v => v.collectionId === c.id), done = items.filter(v => v.completedAt).length;
        return `<article class="collection-card"><span class="collection-symbol">${icon('folder-open')}</span><h2>${esc(c.title)}</h2><p>${c.subjects.length} subassuntos · ${done}/${items.length} concluídos</p><button class="button secondary" data-collection="${c.id}">Abrir projeto ${icon('chevron-right')}</button><button class="icon-button" data-delete-collection="${c.id}" aria-label="Excluir projeto ${esc(c.title)}">${icon('trash-2')}</button></article>`;
      }).join('')}</div>` : `<div class="library-empty">${icon('folder-open')}<h2>Um lugar para cada projeto.</h2><p>Crie um projeto, adicione subassuntos e organize os PDFs e vídeos relacionados.</p><button class="button primary" data-new-collection>${icon('plus')}Criar primeiro projeto</button></div>`;
    } else {
      const materials = orderedMaterials();
      if (activeMaterial && !materials.some(m => m.value.id === activeMaterial!.id)) activeMaterial = undefined;
      const active = materials.find(m => m.value.id === activeMaterial?.id), index = materials.findIndex(m => m.value.id === activeMaterial?.id);
      const completed = materials.filter(m => m.value.completedAt).length;
      const groups = [...collection.subjects, { id: '__none', title: 'Sem subassunto' }];
      $('#collection-content').innerHTML = `<nav class="project-tabs" aria-label="Navegação de projetos"><button class="text-button back-button" id="back-collections">${icon('arrow-left')}Todos os projetos</button><span aria-current="page">${esc(collection.title)}</span></nav><div class="collection-header"><div><h2>${esc(collection.title)}</h2><p>${completed}/${materials.length} materiais concluídos neste dispositivo</p><progress max="${materials.length || 1}" value="${completed}" aria-label="Progresso do projeto"></progress></div><div class="inline-actions"><button class="icon-button" id="rename-collection" aria-label="Renomear projeto">${icon('pencil')}</button></div></div><div class="project-layout"><aside class="project-outline" aria-label="Materiais do projeto"><h3>Acompanhamento</h3>${groups.map(group => `<section class="outline-topic"><button data-subject="${group.id}" class="topic-title ${selectedSubject === group.id ? 'active' : ''}">${esc(group.title)}</button><div class="material-list">${materials.filter(m => group.id === '__none' ? !collection.subjects.some(subject => subject.id === m.value.subjectId) : m.value.subjectId === group.id).map(m => materialCard(m.value, m.kind)).join('') || '<p class="topic-empty">Sem materiais</p>'}</div></section>`).join('')}<button class="text-button" id="new-subject">${icon('plus')}Novo subassunto</button>${selectedSubject && selectedSubject !== '__none' ? '<div class="topic-actions"><button class="text-button" id="rename-subject">Renomear subassunto</button><button class="text-button" id="remove-subject">Remover subassunto</button></div>' : ''}<div class="material-actions"><button class="button primary" id="collection-pdf">${icon('plus')}Adicionar PDF</button><button class="button secondary" id="collection-video">${icon('plus')}Adicionar vídeo</button></div><details class="project-notes"><summary>Notas do projeto</summary><label class="field-label">Anotações locais<textarea id="project-notes" rows="5" maxlength="20000">${esc(collection.notes)}</textarea></label><button class="button secondary" id="save-project-notes">Salvar notas</button></details></aside><section class="project-stage" aria-label="Conteúdo do projeto"><div class="course-navigation"><button class="text-button" id="previous-material" ${index <= 0 ? 'disabled' : ''}>${icon('arrow-left')}Anterior</button><span>${active ? `${index + 1} de ${materials.length}` : 'Selecione um material'}</span><button class="text-button" id="next-material" ${index < 0 || index >= materials.length - 1 ? 'disabled' : ''}>Próximo${icon('chevron-right')}</button>${active ? `<button class="button ${active.value.completedAt ? 'secondary' : 'primary'}" id="toggle-completed">${icon('check')}${active.value.completedAt ? 'Marcar como pendente' : 'Marcar como concluído'}</button>` : ''}</div><div id="project-outlet">${active ? '' : '<div class="no-results">Abra um material na lateral para acompanhar o projeto. Selecione um subassunto antes de adicionar novos arquivos.</div>'}</div></section></div>`;
      const state=notesUI.get(collection.id);if(state){$<HTMLDetailsElement>('.project-notes').open=state.open;$<HTMLTextAreaElement>('#project-notes').value=state.draft;}
      mountMaterial();
    }
    options.icons();
  }
  function renderDocumentList() {
    $('#pdf-list').hidden = Boolean(current);
    $('#pdf-list').innerHTML = documents.length ? documents.map(d => `<article class="doc-card"><div class="doc-card-top">${icon('file-text')}<span>${d.pages.length} ${d.pages.length === 1 ? 'página' : 'páginas'}</span></div><h2>${esc(d.title)}</h2><p>${esc(collections.find(c => c.id === d.collectionId)?.title ?? 'Sem projeto')}</p><div class="library-actions"><button class="button secondary" data-open-pdf="${d.id}">Abrir página ${icon('arrow-up-right')}</button><button class="icon-button" data-delete-pdf="${d.id}" aria-label="Excluir PDF ${esc(d.title)}">${icon('trash-2')}</button></div></article>`).join('') : `<div class="library-empty">${icon('file-text')}<h2>Seu próximo capítulo, em português.</h2><p>Adicione um PDF com texto selecionável. As imagens são preservadas e os textos podem ser revisados.</p><button class="button primary" data-add-pdf>${icon('plus')}Selecionar PDF</button></div>`;
    options.icons();
  }
  function renderReader() {
    const previous=$('#pdf-reader').dataset.documentId,oldSettings=document.querySelector<HTMLDetailsElement>('#pdf-settings');if(previous&&oldSettings)readerUI.set(previous,oldSettings.open);
    $('#pdf-reader').dataset.documentId=current?.id||'';
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
    $('#pdf-reader').hidden = !current;
    $('#pdf-list').hidden = Boolean(current);
    if (!current) { $('#pdf-reader').innerHTML = ''; return; }
    const blocks = current.pages.flatMap(p => p.blocks);
    const remaining = blocks.filter(b => !b.translated).length;
    $('#pdf-reader').innerHTML = `<button class="text-button back-button" id="back-documents">${icon('arrow-left')}Todos os PDFs</button><div class="reader-heading"><div><h2>${esc(current.title)}</h2><p>${current.pages.length} páginas · ${blocks.length - remaining}/${blocks.length} trechos traduzidos</p></div><div class="inline-actions"><button class="icon-button" id="rename-pdf" aria-label="Renomear página">${icon('pencil')}</button><button class="button secondary" id="export-page">${icon('download')}Exportar página HTML</button></div></div><div class="organization-bar" id="pdf-organization">${selectors(current, 'pdf')}</div><div class="source-settings"><label>Idioma original<select id="pdf-source-language">${LANGUAGES.map(([code, label]) => `<option value="${code}" ${(current!.sourceLanguage || 'en') === code ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="inline-actions"><button class="button secondary" id="online-pdf" ${!blocks.length ? 'disabled' : ''}>Traduzir texto com Gemini</button><button class="text-button" id="analyze-pdf" ${!blocks.length ? 'disabled' : ''}>Analisar texto com Gemini</button></div>${current.analysis ? `<details class="analysis-panel"><summary>Análise em PT-BR</summary><p class="analysis-copy">${esc(current.analysis)}</p></details>` : ''}</div><div class="reader-controls"><button class="button primary" id="translate-pdf" ${busy || !blocks.length || !remaining ? 'disabled' : ''}>${icon('languages')}Traduzir ${remaining ? 'textos pendentes' : 'concluído'}</button><button class="button secondary" id="read-pdf">${icon('volume-2')}Ler em PT-BR</button><button class="icon-button" id="pause-reading" aria-label="Pausar ou continuar narração">${icon('pause')}</button><button class="icon-button" id="stop-reading" aria-label="Parar narração">${icon('x')}</button></div><div class="voice-controls"><label>Voz local<select data-voice-select aria-label="Voz local da página"></select></label><label>Velocidade<select data-voice-rate aria-label="Velocidade da narração da página"><option value="0.8">0,8×</option><option value="1">1×</option><option value="1.2">1,2×</option><option value="1.5">1,5×</option></select></label><span class="voice-note">Somente vozes locais PT-BR. Nenhum texto é enviado para narração online.</span></div>${!blocks.length ? '<div class="library-notice">Este PDF não tem uma camada de texto selecionável. As páginas foram preservadas como imagens; OCR de PDFs escaneados ainda não está disponível.</div>' : ''}<div class="reading-pages">${current.pages.map(page => {
      const elements = [...page.blocks.map(b => ({ y: b.y, html: `<section class="pdf-block ${b.heading ? 'pdf-heading' : ''} ${b.translated ? '' : 'pending'}" data-pdf-block="${b.id}"><div class="pdf-block-actions"><button class="icon-button" data-read-block="${b.id}" aria-label="Ler trecho em PT-BR">${icon('volume-2')}</button><button class="icon-button" data-edit-block="${b.id}" aria-label="Editar tradução do trecho">${icon('pencil')}</button></div><p class="pdf-copy">${esc(b.translated || b.original)}</p><span class="untranslated" ${b.translated ? 'hidden' : ''}>Texto original · tradução pendente</span><details><summary>Texto original</summary><p>${esc(b.original)}</p></details></section>` })), ...page.images.map(image => ({ y: image.y, html: `<figure class="pdf-figure">${image.blank ? '<details><summary>Elemento visual adicional do PDF</summary>' : ''}<a href="${makeURL(image.blob)}" target="_blank" rel="noopener" aria-label="Abrir imagem original da página ${page.number}"><img src="${makeURL(image.blob)}" width="${image.width}" height="${image.height}" style="width:${image.displayWidth ?? image.width}px" alt="Imagem ${page.images.indexOf(image) + 1} da página ${page.number} do PDF" loading="lazy" /></a>${image.blank ? '</details>' : ''}<figcaption>Imagem do PDF original</figcaption></figure>` }))].sort((a, b) => a.y - b.y);
      return `<article class="reading-page"><div class="page-marker">PÁGINA ${page.number}</div>${elements.map(e => e.html).join('')}<details class="pdf-preview"><summary>Ver página original e elementos gráficos</summary><img src="${makeURL(page.preview)}" alt="Página original ${page.number}" loading="lazy" /></details></article>`;
    }).join('')}</div>`;
    const settings=document.createElement('details');settings.className='material-settings';settings.id='pdf-settings';settings.open=readerUI.get(current.id)||false;settings.innerHTML='<summary>Organização, idioma e voz</summary>';
    const organization=$('#pdf-organization'),source=$('#pdf-reader .source-settings'),voices=$('#pdf-reader>.voice-controls'),controls=$('#pdf-reader .reader-controls');
    controls.append(source.querySelector('.inline-actions')!);$('.reader-heading').after(controls);controls.after(settings);settings.append(organization,source,voices);
    voices.insertAdjacentHTML('beforeend','<button type="button" class="button secondary" data-prepare-voice>Preparar voz natural</button><span class="voice-note" data-voice-status></span>');
    options.icons(); updateVoiceControls();
  }
  function updateVoiceControls() {
    const narrator = options.narrator;
    document.querySelectorAll<HTMLSelectElement>('[data-voice-select]').forEach(select => {
      select.innerHTML = narrator.voices.length ? narrator.voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === narrator.voice?.voiceURI ? 'selected' : ''}>${esc(v.name)} · PT-BR</option>`).join('') : '<option value="">Nenhuma voz local PT-BR instalada</option>';
    });
    document.querySelectorAll<HTMLSelectElement>('[data-voice-rate]').forEach(s => { s.value = String(narrator.rate); });
    document.querySelectorAll<HTMLElement>('[data-voice-status]').forEach(element=>{element.textContent=narrator.status;});
    const pause = $('#pause-reading'); if (pause) { (pause as HTMLButtonElement).disabled = narrator.state === 'idle'; pause.title = narrator.state === 'paused' ? 'Continuar narração' : 'Pausar narração'; }
    const stop = $('#stop-reading'); if (stop) (stop as HTMLButtonElement).disabled = narrator.state === 'idle';
  }
  options.narrator.subscribe(updateVoiceControls);

  async function storeCurrent() {
    if (!current) return;
    await saveDocument(current);
  }
  function setBusy(value: boolean) {
    busy = value; $('#pdf-progress').hidden = !value;
    if ($('#translate-pdf')) ($<HTMLButtonElement>('#translate-pdf')).disabled = value || !current?.pages.some(p => p.blocks.some(b => !b.translated));
    if ($('#pdf-source-language')) $<HTMLSelectElement>('#pdf-source-language').disabled = value;
    renderVideoOrganization();
  }
  async function cancel() {
    operation++;
    abort?.abort(); abort = undefined; pdfWorker?.terminate(); pdfWorker = undefined;
    await saveQueue;
    setBusy(false);
    await refresh();
    if (current) renderReader();
  }
  function fail(error: unknown) {
    void cancel();
    $('#pdf-error').textContent = error instanceof Error ? error.message : String(error);
    $('#pdf-error').hidden = false;
  }
  async function openPdf(id: string, inProject = false) {
    if (!guard()) return;
    options.stopMedia(); options.narrator.stop();
    current = documents.find(d => d.id === id);
    if (!current) return;
    $('#pdf-error').hidden = true;
    if (inProject) activeMaterial = { id, kind: 'pdf' };
    options.changeView(inProject ? 'collections' : 'documents'); renderReader();
    if (inProject) renderCollections();
  }
  function choosePdf(value: Assignment = {}) {
    if (!guard()) return;
    importAssignment = value;
    $<HTMLInputElement>('#pdf-input').click();
  }
  async function importPdf(file: File) {
    if (!guard()) return;
    options.stopMedia(); options.narrator.stop();
    options.changeView('documents'); $('#pdf-error').hidden = true;
    const token = ++operation;
    setBusy(true); const controller = new AbortController(); abort = controller;
    try {
      const parsed = await extractPdf(file, (page, total) => { $('#pdf-progress-label').textContent = `Preparando texto e imagens: página ${page} de ${total}…`; }, controller.signal);
      if (token !== operation) return;
      current = { ...parsed, ...importAssignment };
      try { await storeCurrent(); }
      catch { options.toast('Sem espaço para guardar o PDF. A página continua nesta sessão; exporte o HTML para preservar os textos e imagens.'); }
      await refresh(); renderReader();
      if (current.collectionId) { selectedCollection = current.collectionId; activeMaterial = { id: current.id, kind: 'pdf' }; options.changeView('collections'); renderCollections(); }
      const total = current.pages.flatMap(p => p.blocks).length;
      options.toast(`PDF importado: ${current.pages.length} páginas. ${total ? 'Clique em Traduzir textos pendentes para gerar o português.' : 'Nenhum texto selecionável encontrado.'}`);
    } catch (error) {
      if (controller.signal.aborted) options.toast('Importação cancelada.');
      else fail(error);
    } finally { if (token === operation) { setBusy(false); abort = undefined; } }
  }
  function translate() {
    if (!guard() || !current) return;
    const target = current;
    const blocks = target.pages.flatMap(p => p.blocks).filter(b => !b.translated);
    if (!blocks.length) return;
    options.narrator.stop(); setBusy(true); $('#pdf-error').hidden = true;
    const token = ++operation;
    $('#pdf-progress-label').textContent = 'Preparando a tradução local para PT-BR…';
    pdfWorker = new Worker(new URL('./processor.worker.ts', import.meta.url), { type: 'module' });
    pdfWorker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Não foi possível executar a tradução local.')); };
    pdfWorker.onmessage = async (event: MessageEvent<WorkerEvent>) => {
      if (token !== operation) return;
      const data = event.data;
      if (data.type === 'status') $('#pdf-progress-label').textContent = data.message;
      if (data.type === 'text-translated') {
        const block = blocks.find(b => b.id === data.id);
        if (block) block.translated = data.translated;
        const element = document.querySelector<HTMLElement>(`[data-pdf-block="${data.id}"]`);
        if (element) { element.querySelector('.pdf-copy')!.textContent = data.translated; element.classList.remove('pending'); (element.querySelector('.untranslated') as HTMLElement).hidden = true; }
        saveQueue = saveQueue.then(async () => { await saveDocument(target); }).catch(() => options.toast('Sem espaço para salvar todos os textos. Exporte a página HTML.'));
      }
      if (data.type === 'error') fail(new Error(`A tradução não terminou. Os textos já traduzidos e as imagens continuam disponíveis. Verifique a conexão e a memória do dispositivo. Detalhe: ${data.message}`));
      if (data.type === 'text-complete') {
        pdfWorker?.terminate(); pdfWorker = undefined;
        await saveQueue; setBusy(false); await refresh(); renderReader(); options.toast('Página traduzida. Você pode revisar os textos e ouvir a narração em PT-BR.');
      }
    };
    pdfWorker.postMessage({ sourceLanguage: target.sourceLanguage || 'en', blocks: blocks.map(b => ({ id: b.id, text: b.original })), baseURL: new URL(import.meta.env.BASE_URL, location.href).href });
  }
  function titleForm(title: string, value: string, action: (title: string) => Promise<void>) {
    options.dialog(`<h2>${esc(title)}</h2><form id="learning-title-form"><label class="field-label">Título<input id="learning-title" maxlength="200" required value="${esc(value)}" /></label><button class="button primary" type="submit">${icon('check')}Salvar</button></form>`);
    $('#learning-title-form').addEventListener('submit', async () => {
      const value = $<HTMLInputElement>('#learning-title').value.trim(); if (!value) return;
      try { await action(value); $<HTMLDialogElement>('#dialog').close(); await refresh(); }
      catch { options.toast('Não foi possível salvar. Confira o espaço disponível neste navegador.'); }
    });
    $<HTMLInputElement>('#learning-title').focus();
  }
  function newCollection() {
    if (!guard()) return;
    titleForm('Criar projeto', '', async title => {
      const value = { id: crypto.randomUUID(), title, createdAt: Date.now(), subjects: [] };
      await saveCollection(value); selectedCollection = value.id; selectedSubject = ''; activeMaterial = undefined; options.changeView('collections');
    });
  }
  function readBlocks(id?: string) {
    if (!current) return;
    const blocks = current.pages.flatMap(p => p.blocks).filter(b => b.translated.trim() && (!id || b.id === id));
    if (!blocks.length) { options.toast('Traduza ou revise o texto em PT-BR antes de narrar.'); return; }
    try {
      options.narrator.requireVoice(); options.stopMedia();
      options.narrator.read(blocks.map(b => ({ id: b.id, text: b.translated })), active => {
        document.querySelectorAll('[data-pdf-block]').forEach(element => element.classList.toggle('is-reading', element.getAttribute('data-pdf-block') === active));
        document.querySelector(`[data-pdf-block="${active}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, error => { document.querySelectorAll('.is-reading').forEach(el => el.classList.remove('is-reading')); if (error) options.toast(error); });
    } catch (error) { options.toast(error instanceof Error ? error.message : 'Não foi possível iniciar a narração.'); }
  }
  async function exportPage() {
    if (!current) return;
    const dataURL = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    const pages = await Promise.all(current.pages.map(async page => {
      const images = await Promise.all(page.images.map(async image => ({ y: image.y, html: `<figure><img src="${await dataURL(image.blob)}" alt="Imagem original da página ${page.number}" /></figure>` })));
      const texts = page.blocks.map(block => ({ y: block.y, html: `<${block.heading ? 'h2' : 'p'}>${esc(block.translated || block.original)}</${block.heading ? 'h2' : 'p'}>${block.translated ? '' : '<small>Texto original; tradução pendente.</small>'}` }));
      return `<article><small>Página ${page.number}</small>${[...texts, ...images].sort((a, b) => a.y - b.y).map(e => e.html).join('')}<details><summary>Página original</summary><img src="${await dataURL(page.preview)}" alt="Página original ${page.number}" /></details></article>`;
    }));
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'"><title>${esc(current.title)}</title><style>body{font:17px/1.8 system-ui;color:#27283e;background:#f7f7fb;max-width:850px;margin:auto;padding:25px}article{background:white;padding:30px;margin:25px 0;border-radius:10px}img{max-width:100%;height:auto}figure{margin:20px 0}small,summary{color:#777}h2{line-height:1.4}details img{width:100%}</style><h1>${esc(current.title)}</h1>${pages.join('')}</html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = `${current.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function unassign(collectionId: string, subjectId?: string) {
    for (const material of videos.filter(v => v.collectionId === collectionId && (!subjectId || v.subjectId === subjectId))) {
      if (!subjectId) delete material.collectionId;
      delete material.subjectId; await saveProject(material);
    }
    for (const material of documents.filter(v => v.collectionId === collectionId && (!subjectId || v.subjectId === subjectId))) {
      if (!subjectId) delete material.collectionId;
      delete material.subjectId; await saveDocument(material);
    }
  }
  function moveMaterial(id:string,kind:'pdf'|'video') {
    if(!guard())return;
    const item=kind==='pdf'?documents.find(item=>item.id===id):videos.find(item=>item.id===id);if(!item)return;
    const epoch=options.accountEpoch();
    options.dialog(`<h2>Mover material</h2><p>${esc(item.title)}</p><form id="move-material-form"><div class="organization-bar" id="move-assignment">${selectors(item,'move')}</div><label class="field-label">Posição no subassunto<select id="move-position" aria-label="Posição do material"></select></label><p class="field-error" id="move-error" role="alert"></p><button class="button primary" type="submit">Mover material</button></form>`);
    const destination=()=>({collectionId:$<HTMLSelectElement>('#move-collection').value||undefined,subjectId:$<HTMLSelectElement>('#move-subject').value||undefined});
    const entries=():{value:Project|PdfDocument;kind:'video'|'pdf'}[]=>[...videos.map(value=>({value,kind:'video' as const})),...documents.map(value=>({value,kind:'pdf' as const}))];
    const group=()=>{const value=destination();return entries().filter(entry=>!(entry.value.id===id&&entry.kind===kind)&&entry.value.collectionId===value.collectionId&&entry.value.subjectId===value.subjectId).sort((a,b)=>(a.value.sortOrder??a.value.createdAt)-(b.value.sortOrder??b.value.createdAt));};
    const positions=()=>{$('#move-position').innerHTML=[...group().map((entry,index)=>`<option value="${index}">Antes de ${esc(entry.value.title)}</option>`),`<option value="${group().length}" selected>No final</option>`].join('');};positions();
    $('#move-assignment').addEventListener('change',event=>{if((event.target as HTMLElement).id==='move-collection')$('#move-assignment').innerHTML=selectors({collectionId:destination().collectionId},'move');positions();});
    $('#move-material-form').addEventListener('submit',async event=>{
      event.preventDefault();if(epoch!==options.accountEpoch()||!guard())return;
      const button=$<HTMLButtonElement>('#move-material-form button[type=submit]');button.disabled=true;
      try {
        const value=destination(),members=group();members.splice(Number($<HTMLSelectElement>('#move-position').value),0,{value:{...item,...value},kind});
        const arranged=members.map((entry,index)=>({...entry,value:{...entry.value,sortOrder:index}}));
        await saveMaterials(arranged.filter(entry=>entry.kind==='video').map(entry=>entry.value as Project),arranged.filter(entry=>entry.kind==='pdf').map(entry=>entry.value as PdfDocument));
        if(epoch!==options.accountEpoch())return;
        if(kind==='video'&&options.currentVideo()?.id===id)await options.assignVideo({...value,sortOrder:arranged.find(entry=>entry.kind===kind&&entry.value.id===id)!.value.sortOrder});
        if(activeMaterial?.id===id){if(value.collectionId===selectedCollection)selectedSubject=value.subjectId||'__none';else{options.stopMedia();options.narrator.stop();activeMaterial=undefined;}}
        await options.refreshVideos();await refresh();if(current)renderReader();renderCollections();$<HTMLDialogElement>('#dialog').close();options.toast('Material movido. Ordem e organização salvas neste dispositivo.');
      }catch(error){if(epoch===options.accountEpoch())$('#move-error').textContent=error instanceof Error?error.message:'Não foi possível mover o material.';}finally{button.disabled=false;}
    });
  }
  document.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
    const id = button.id;
    try {
      if (id === 'new-collection' || button.hasAttribute('data-new-collection')) newCollection();
      if(button.dataset.moveMaterial)moveMaterial(button.dataset.moveMaterial,button.dataset.kind as 'pdf'|'video');
      if(button.dataset.removeMaterial&&guard()){
        const value=button.dataset.removeMaterial,kind=button.dataset.kind;
        options.stopMedia();options.narrator.stop();
        options.dialog(`<h2>Excluir ${kind==='pdf'?'página PDF':'vídeo'}?</h2><p>O material será removido deste dispositivo e do projeto. Seu arquivo original será preservado.</p><button type="button" class="button danger" id="confirm-delete-material">Excluir material</button>`);
        $('#confirm-delete-material').addEventListener('click',async()=>{
          try{if(kind==='pdf'){await deleteDocument(value);if(current?.id===value){current=undefined;renderReader();}}else await options.deleteVideo(value);
            if(activeMaterial?.id===value)activeMaterial=undefined;await refresh();$<HTMLDialogElement>('#dialog').close();options.toast('Material excluído.');
          }catch{options.toast('Não foi possível excluir o material.');}
        });
      }
      if(button.hasAttribute('data-prepare-voice')&&guard()){
        button.disabled=true;try{await options.narrator.prepare();options.toast('Voz natural pronta para uso local.');}catch(error){options.toast(error instanceof Error?error.message:'Não foi possível preparar a voz.');}finally{button.disabled=false;}
      }
      if (button.dataset.collection && guard()) { selectedCollection = button.dataset.collection; selectedSubject = ''; activeMaterial = undefined; const materials = orderedMaterials(); const resume = materials.find(m => m.value.id === selected()?.lastMaterialId) ?? materials[0]; if (resume) await openMaterial(resume.value.id, resume.kind); else renderCollections(); }
      if (button.dataset.subject !== undefined) { selectedSubject = button.dataset.subject; renderCollections(); }
      if (id === 'back-collections' && guard()) { options.stopMedia(); options.narrator.stop(); activeMaterial = undefined; selectedCollection = undefined; selectedSubject = ''; renderCollections(); }
      if (id === 'new-subject' && selected() && guard()) titleForm('Criar subassunto', '', async title => { selected()!.subjects.push({ id: crypto.randomUUID(), title }); await saveCollection(selected()!); });
      if (id === 'rename-collection' && guard()) titleForm('Renomear projeto', selected()!.title, async title => { selected()!.title = title; await saveCollection(selected()!); });
      if (id === 'rename-subject' && guard()) titleForm('Renomear subassunto', selected()!.subjects.find(s => s.id === selectedSubject)!.title, async title => { selected()!.subjects.find(s => s.id === selectedSubject)!.title = title; await saveCollection(selected()!); });
      if (button.dataset.deleteCollection || id === 'remove-subject') {
        if (!guard()) return;
        const collection = button.dataset.deleteCollection?collections.find(c=>c.id===button.dataset.deleteCollection):selected();if(!collection)return;
        const subject = id === 'remove-subject' ? selectedSubject : undefined;
        options.dialog(`<h2>Remover ${subject ? 'subassunto' : 'organização do projeto'}?</h2><p>Os PDFs, vídeos e traduções continuarão nas bibliotecas. Somente essa organização será removida.</p><button id="confirm-remove-organization" class="button danger">${icon('trash-2')}Remover organização</button>`);
        $('#confirm-remove-organization').addEventListener('click', async () => {
          await unassign(collection.id, subject);
          if (subject) { collection.subjects = collection.subjects.filter(s => s.id !== subject); await saveCollection(collection); selectedSubject = ''; }
          else { await deleteCollection(collection.id); notesUI.delete(collection.id);selectedCollection = undefined; }
          $<HTMLDialogElement>('#dialog').close(); await refresh();
          const live = options.currentVideo();
          if (live?.collectionId === collection.id && (!subject || live.subjectId === subject)) await options.assignVideo({ collectionId: subject ? collection.id : undefined, subjectId: undefined });
        });
      }
      if (id === 'collection-video' && guard()) options.addVideo(assignment());
      if (id === 'collection-pdf') choosePdf(assignment());
      if (id === 'add-pdf' || button.hasAttribute('data-add-pdf')) choosePdf();
      if (id === 'cancel-pdf') { await cancel(); options.toast('Processamento cancelado. Os textos já concluídos permanecem salvos.'); }
      if (id === 'previous-material' || id === 'next-material') { const materials = orderedMaterials(), index = materials.findIndex(m => m.value.id === activeMaterial?.id), target = materials[index + (id === 'next-material' ? 1 : -1)]; if (target) await openMaterial(target.value.id, target.kind); }
      if (id === 'save-project-notes' && selected() && guard()) { selected()!.notes = $<HTMLTextAreaElement>('#project-notes').value; await saveCollection(selected()!); options.toast('Notas salvas neste dispositivo.'); }
      if (id === 'toggle-completed' && guard()) {
        const item = orderedMaterials().find(m => m.value.id === activeMaterial?.id); if (!item) return;
        item.value.completedAt = item.value.completedAt ? undefined : Date.now();
        if (item.kind === 'pdf') { await saveDocument(item.value as PdfDocument); if (current?.id === item.value.id) current.completedAt = item.value.completedAt; }
        else { await saveProject(item.value as Project); const live = options.currentVideo(); if (live?.id === item.value.id) live.completedAt = item.value.completedAt; await options.refreshVideos(); }
        await refresh();
      }
      if ((id === 'online-pdf' || id === 'analyze-pdf') && current) {
        const target = current, blocks = target.pages.flatMap(p => p.blocks), items = blocks.map(b => ({ id: b.id, original: b.original }));
        if (id === 'online-pdf') options.online.translate(items, async values => { options.narrator.stop(); for (const value of values) blocks.find(b => b.id === value.id)!.translated = value.translated; await saveDocument(target); await refresh(); if (current?.id === target.id) renderReader(); });
        else options.online.analyze(items, async value => { target.analysis = value; await saveDocument(target); await refresh(); if (current?.id === target.id) renderReader(); });
      }
      if (id === 'translate-pdf') translate();
      if (id === 'back-documents') { options.narrator.stop(); current = undefined; renderReader(); renderDocumentList(); }
      if (button.dataset.openPdf) await openPdf(button.dataset.openPdf);
      if (button.dataset.material) await openMaterial(button.dataset.material, button.dataset.kind as 'video' | 'pdf');
      if (button.dataset.deletePdf && guard()) {
        const value = button.dataset.deletePdf;
        options.dialog(`<h2>Excluir esta página PDF?</h2><p>Os textos e imagens locais desse documento serão removidos. O arquivo original não será alterado.</p><button class="button danger" id="confirm-delete-pdf">Excluir página</button>`);
        $('#confirm-delete-pdf').addEventListener('click', async () => { await deleteDocument(value); if (current?.id === value) { options.narrator.stop(); current = undefined; renderReader(); } await refresh(); $<HTMLDialogElement>('#dialog').close(); });
      }
      if (id === 'rename-pdf' && current && guard()) titleForm('Renomear página', current.title, async title => { current!.title = title; await storeCurrent(); renderReader(); });
      if (id === 'read-pdf') readBlocks();
      if (id === 'pause-reading') { if (options.narrator.state === 'paused') options.narrator.resume(); else options.narrator.pause(); }
      if (id === 'stop-reading') { options.narrator.stop(); document.querySelectorAll('.is-reading').forEach(el => el.classList.remove('is-reading')); }
      if (button.dataset.readBlock) readBlocks(button.dataset.readBlock);
      if (id === 'export-page') await exportPage();
      if (button.dataset.editBlock && current && guard()) {
        const block = current.pages.flatMap(p => p.blocks).find(b => b.id === button.dataset.editBlock)!;
        options.narrator.stop();
        options.dialog(`<h2>Revisar texto em PT-BR</h2><p class="original-review">${esc(block.original)}</p><form id="edit-pdf-form"><label class="field-label">Texto em português<textarea id="pdf-edit-translation" rows="7" maxlength="20000" required>${esc(block.translated)}</textarea></label><button class="button primary" type="submit">${icon('check')}Salvar tradução</button></form>`);
        $('#edit-pdf-form').addEventListener('submit', async () => { block.translated = $<HTMLTextAreaElement>('#pdf-edit-translation').value.trim(); await storeCurrent(); $<HTMLDialogElement>('#dialog').close(); renderReader(); await refresh(); });
      }
    } catch (error) { options.toast(error instanceof Error ? error.message : 'Não foi possível concluir esta ação.'); }
  });
  document.addEventListener('change', async event => {
    const target = event.target as HTMLSelectElement;
    try {
      if (target.matches('[data-voice-select]')) {const voice=target.value;options.stopMedia();options.narrator.stop();options.narrator.voiceURI=voice;updateVoiceControls();}
      if (target.matches('[data-voice-rate]')) options.narrator.rate = Number(target.value);
      if (target.id === 'pdf-source-language' && current && guard()) { current.sourceLanguage = target.value; await storeCurrent(); }
      if (target.id === 'pdf-collection' && current) { current.collectionId = target.value || undefined; current.subjectId = undefined; await storeCurrent(); $('#pdf-organization').innerHTML = selectors(current, 'pdf'); await refresh(); }
      if (target.id === 'pdf-subject' && current) { current.subjectId = target.value || undefined; await storeCurrent(); await refresh(); }
      if (target.id === 'video-collection') await options.assignVideo({ collectionId: target.value || undefined, subjectId: undefined });
      if (target.id === 'video-subject') await options.assignVideo({ collectionId: options.currentVideo()?.collectionId, subjectId: target.value || undefined });
    } catch { options.toast('Não foi possível salvar a organização do material.'); }
  });
  $('#pdf-input').addEventListener('change', event => {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (file) { if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') void importPdf(file); else options.toast('Escolha um arquivo PDF.'); }
    input.value = '';
  });
  return {
    get busy() { return busy; },
    get inProject() { return options.currentView() === 'collections' && Boolean(activeMaterial); },
    prepareView: (view: string) => { if (view !== 'collections') restorePortals(); },
    showVideoInProject: async (id: string) => { const video = options.currentVideo(); if (!video?.collectionId) return; selectedCollection = video.collectionId; await openMaterial(id, 'video'); },
    refresh, renderVideoOrganization, updateVoiceControls,
    flush: () => saveQueue,
    async reset() { await cancel(); options.narrator.stop(); current = undefined; activeMaterial = undefined; selectedCollection = undefined; selectedSubject = '';notesUI.clear();readerUI.clear();$('#collection-content').dataset.projectId='';$('#pdf-reader').dataset.documentId='';renderReader(); await refresh(); },
  };
}
