import './style.css';
import { createIcons, Play, Layers, Languages, ShieldCheck, HardDrive, Download, Upload, Plus, ArrowUpRight, FileVideo, Search, Captions, Check, X, LoaderCircle, ChevronRight, Trash2, FolderOpen, Settings2, Pencil, FileText, MonitorSmartphone, BookOpen, WifiOff, Clock3, CircleHelp, Sparkles, ArrowLeft, Menu } from 'lucide';
import type { Project, Segment, WorkerEvent } from './types';
import { listProjects, saveProject, deleteProject, removeLocalData } from './storage';
import { activeSegment, formatClock, exportSubtitles, parseSubtitles, validateProject } from './subtitles.mjs';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (text: unknown) => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const icon = (name: string, className = '') => `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
const icons = () => createIcons({ icons: { Play, Layers, Languages, ShieldCheck, HardDrive, Download, Upload, Plus, ArrowUpRight, FileVideo, Search, Captions, Check, X, LoaderCircle, ChevronRight, Trash2, FolderOpen, Settings2, Pencil, FileText, MonitorSmartphone, BookOpen, WifiOff, Clock3, CircleHelp, Sparkles, ArrowLeft, Menu } });
const megabytes = (size: number) => `${(size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
const appURL = new URL(import.meta.env.BASE_URL, location.href);

let project: Project | undefined;
let projects: Project[] = [];
let currentFile: File | undefined;
let videoURL = '';
let captionsURL = '';
let worker: Worker | undefined;
let processing = false;
let currentView = 'workspace';
let selectedLanguage: 'translated' | 'original' | 'both' = 'translated';
let active = -1;
let installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | undefined;
let attachToProject = false;
let storageAvailable = true;
let toastTimer: ReturnType<typeof setTimeout>;

$('#app').innerHTML = `
  <div id="menu-backdrop" class="menu-backdrop" hidden></div>
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="./" aria-label="Entrelinhas, início"><span class="brand-mark">${icon('play')}</span><span>entrelinhas<span class="brand-dot">.</span><small>VÍDEOS NO SEU IDIOMA</small></span></a>
    <div class="nav-label">SEU ESPAÇO</div>
    <nav aria-label="Navegação principal">
      <button class="nav-item selected" data-view="workspace">${icon('languages')}<span>Traduzir vídeo</span><span class="nav-arrow">${icon('chevron-right')}</span></button>
      <button class="nav-item" data-view="library">${icon('layers')}<span>Minha biblioteca</span><span id="library-count" class="nav-count">0</span></button>
      <button class="nav-item" data-view="privacy">${icon('shield-check')}<span>Privacidade</span></button>
    </nav>
    <div class="sidebar-bottom">
      <div class="local-card"><span class="local-icon">${icon('hard-drive')}</span><strong>Seu dispositivo. Seu conteúdo.</strong><p>Os vídeos ficam com você.<br>A tradução acontece aqui.</p><span class="local-indicator"><span></span> Processamento local</span></div>
      <button class="install-button" id="install">${icon('monitor-smartphone')}<span>Instalar aplicativo</span>${icon('arrow-up-right')}</button>
      <div class="sidebar-footer">Feito para aprender, sem barreiras.<span>v0.1 · PWA</span></div>
    </div>
  </aside>
  <div class="app-content">
    <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" id="menu" aria-label="Abrir menu" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span>Seu espaço</span>${icon('chevron-right')}<strong id="breadcrumb-label">Traduzir vídeo</strong></div><div class="private-pill">${icon('shield-check')}<span>Privado por natureza</span></div></header>
    <main>
      <section id="workspace-view">
        <div class="page-heading"><div><div class="eyebrow">APRENDA NO SEU RITMO</div><h1>Entenda cada palavra<span>.</span></h1><p>Seu vídeo em inglês. Sua compreensão em português.</p></div><button class="button primary" data-action="choose-video">${icon('plus')}Adicionar vídeo</button></div>
        <div class="workflow-strip"><span><b>01</b> Adicione seu vídeo</span>${icon('chevron-right')}<span><b>02</b> Transcreva e traduza</span>${icon('chevron-right')}<span><b>03</b> Assista no seu idioma</span><span class="workflow-local">${icon('shield-check')}Sem upload do vídeo</span></div>
        <div class="workspace-grid">
          <section class="player-card" aria-label="Player do vídeo">
            <div class="card-top"><div class="card-label">${icon('file-video')}<span id="video-label">SEU VÍDEO</span></div><span class="badge" id="video-badge">Somente neste dispositivo</span></div>
            <div class="video-stage" id="dropzone">
              <div class="player-empty" id="player-empty"><div class="empty-visual"><div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div><div class="visual-play">${icon('play')}</div><span class="floating-language english">EN</span><span class="floating-language portuguese">PT<span>BR</span></span><div class="waveform">${Array.from({ length: 27 }, (_, i) => `<span style="--height:${[12, 20, 32, 17, 26, 44, 30, 19, 38][i % 9]}px"></span>`).join('')}</div></div><h2>Um novo jeito de entender.</h2><p>Arraste um vídeo aqui ou escolha um arquivo.<br>O conteúdo continua no seu dispositivo.</p><button class="button light" data-action="choose-video">${icon('folder-open')}Selecionar vídeo</button><small>MP4, WebM ou MOV · até 500 MB e 30 min</small></div>
              <video id="video" controls playsinline preload="metadata" hidden aria-label="Vídeo de treinamento"></video>
              <div id="reattach" class="reattach" hidden><span>${icon('file-video')}</span><h3>Selecione o vídeo novamente</h3><p>As legendas estão aqui. O vídeo não foi guardado no dispositivo.</p><button class="button light" id="reattach-button">${icon('folder-open')}Localizar vídeo</button></div>
            </div>
            <div class="player-info"><div><strong id="file-title">Seu próximo treinamento</strong><span id="file-detail">Adicione um vídeo para começar</span></div><span class="language-route">EN ${icon('arrow-up-right')} PT-BR</span></div>
            <div class="player-toolbar"><label class="checkbox-label"><input type="checkbox" id="remember" /><span>Guardar vídeo neste dispositivo</span><button class="icon-button" data-action="storage-help" aria-label="Como funciona o armazenamento local">${icon('circle-help')}</button></label><label class="caption-select">${icon('captions')}<select id="caption-language" aria-label="Idioma das legendas"><option value="translated">Português</option><option value="original">Inglês</option><option value="both">Os dois idiomas</option><option value="off">Sem legenda</option></select></label></div>
            <div class="process-area"><div class="process-copy"><span class="sparkle-icon">${icon('sparkles')}</span><div><strong id="process-title">Traduza sem sair daqui</strong><p id="process-description">A IA roda no navegador. Nenhuma chave de API necessária.</p></div></div><button class="button primary" id="process" disabled>${icon('languages')}Transcrever e traduzir</button></div>
            <div class="progress-area" id="progress-area" hidden aria-live="polite"><div class="progress-top"><span>${icon('loader-circle', 'spin')}<strong id="progress-message">Preparando…</strong></span><button class="text-button" id="cancel">Cancelar</button></div><div class="progress-track"><div id="progress-bar"></div></div><p>O processamento é local. Mantenha esta tela aberta; o primeiro uso baixa os modelos de IA.</p></div>
            <div class="error-panel" id="error-panel" hidden role="alert"><strong>Não foi possível concluir</strong><p id="error-message"></p><details><summary>Detalhes técnicos</summary><pre id="error-detail"></pre></details></div>
          </section>
          <section class="transcript-card" aria-label="Transcrição sincronizada">
            <div class="transcript-top"><div><h2>${icon('captions')}Palavra por palavra</h2><p>Acompanhe o texto junto com o vídeo.</p></div><button class="icon-button" id="export" aria-label="Exportar legendas" disabled>${icon('download')}</button></div>
            <div class="transcript-tabs" role="tablist" aria-label="Idioma da transcrição"><button role="tab" aria-selected="true" class="active" data-language="translated">Português <span>BR</span></button><button role="tab" aria-selected="false" data-language="original">Original <span>EN</span></button><button role="tab" aria-selected="false" data-language="both">Ambos</button></div>
            <div class="transcript-search">${icon('search')}<input type="search" id="search" placeholder="Buscar na transcrição" aria-label="Buscar na transcrição" disabled /><span id="segment-count">0 trechos</span></div>
            <div class="transcript-scroll" id="transcript"><div class="transcript-empty"><div class="paper-visual">${icon('file-text')}<span></span><span></span><span></span></div><h3>As palavras vão aparecer aqui</h3><p>Transcreva seu vídeo para acompanhar<br>cada trecho em português.</p><span class="tiny-pill">${icon('clock-3')}Sincronizado com a reprodução</span></div></div>
            <div class="transcript-bottom"><label class="switch-label"><input type="checkbox" id="follow" checked /><span class="switch"></span> Acompanhar vídeo</label><button class="text-button" id="import-captions">Importar legenda</button></div>
          </section>
        </div>
        <div class="feature-grid"><div>${icon('shield-check')}<div><strong>Privacidade em primeiro lugar</strong><p>Vídeo e áudio nunca são enviados a um servidor.</p></div></div><div>${icon('book-open')}<div><strong>Aprenda no seu idioma</strong><p>Leia, busque e volte ao trecho que precisar.</p></div></div><div>${icon('monitor-smartphone')}<div><strong>Seu espaço em qualquer tela</strong><p>Instale no computador ou no celular.</p></div></div></div>
        <div class="model-note">${icon('download')}No primeiro uso, os modelos de IA são baixados (centenas de MB). Depois, os modelos completos em cache podem funcionar offline. A tradução automática pode precisar de revisão.</div>
      </section>
      <section id="library-view" hidden><div class="page-heading"><div><div class="eyebrow">APRENDIZADO QUE FICA</div><h1>Minha biblioteca<span>.</span></h1><p>Projetos guardados apenas neste navegador e dispositivo.</p></div><button class="button secondary" id="import-project">${icon('upload')}Importar projeto</button></div><div class="library-notice">${icon('hard-drive')}Vídeos só são guardados quando você ativa essa opção. Exporte os projetos como backup: limpar os dados do navegador pode apagar sua biblioteca.</div><div id="library-grid" class="library-grid"></div></section>
      <section id="privacy-view" hidden><div class="page-heading"><div><div class="eyebrow">VOCÊ TEM O CONTROLE</div><h1>Privado por natureza<span>.</span></h1><p>Uma ferramenta pública. Seus treinamentos continuam privados.</p></div></div><div class="privacy-grid"><article class="info-card">${icon('shield-check')}<h2>O arquivo fica com você</h2><p>Vídeo, áudio, transcrição e tradução são processados no navegador. Não usamos serviços de transcrição ou tradução remotos, contas, analytics ou uploads.</p><p>O site e os modelos de IA precisam ser baixados pela internet no primeiro uso. Esses pedidos de download não contêm o conteúdo do seu vídeo.</p></article><article class="info-card">${icon('hard-drive')}<h2>Biblioteca local, sem nuvem</h2><p>Os textos ficam no IndexedDB deste navegador. Por padrão, o vídeo só fica na memória da sessão. Ative “Guardar vídeo neste dispositivo” para também manter uma cópia local.</p><p>Os dados não são criptografados pelo aplicativo. Outras pessoas com acesso a este perfil do navegador podem abrir a biblioteca. Use um dispositivo e perfil confiáveis.</p></article><article class="info-card">${icon('wifi-off')}<h2>Preparado para ficar offline</h2><p>O aplicativo instalado guarda a interface. Os modelos completos baixados são armazenados em cache. Antes de depender do modo offline, conclua um processamento online e teste novamente sem conexão.</p><p>Celulares com pouca memória podem não conseguir executar os modelos. Você pode importar legendas ou projetos produzidos em outro dispositivo.</p></article><article class="info-card">${icon('settings-2')}<h2>Seus dados, suas escolhas</h2><p>Exporte os textos e legendas pela área de tradução. Exporte um projeto JSON para manter os dois idiomas e os tempos (o JSON não inclui o vídeo).</p><p id="storage-estimate">Consultando armazenamento…</p><button class="button danger" id="clear-data">${icon('trash-2')}Apagar biblioteca e modelos locais</button></article></div></section>
    </main>
    <footer class="main-footer"><span>entrelinhas<span class="brand-dot">.</span></span><span>Mais compreensão. Menos barreiras.</span><button class="text-button" data-view="privacy">Sobre a privacidade ${icon('arrow-up-right')}</button></footer>
  </div>
  <input type="file" id="video-input" accept="video/*,.mp4,.webm,.mov,.mkv" hidden />
  <input type="file" id="captions-input" accept=".srt,.vtt,text/vtt" hidden />
  <input type="file" id="project-input" accept=".json,application/json" hidden />
  <dialog id="dialog"><div id="dialog-content"></div></dialog>
  <div id="toast" class="toast" hidden role="status"></div>
`;
icons();

function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500);
}

function dialog(content: string) {
  $('#dialog-content').innerHTML = `<button class="icon-button dialog-close" data-action="close-dialog" aria-label="Fechar">${icon('x')}</button>${content}`;
  icons();
  $('#dialog').querySelectorAll('form').forEach(form => form.addEventListener('submit', event => event.preventDefault()));
  $<HTMLDialogElement>('#dialog').showModal();
}

function changeView(view: string) {
  currentView = view;
  for (const name of ['workspace', 'library', 'privacy']) $(`#${name}-view`).hidden = name !== view;
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('selected', el.getAttribute('data-view') === view));
  $('#breadcrumb-label').textContent = ({ workspace: 'Traduzir vídeo', library: 'Minha biblioteca', privacy: 'Privacidade' })[view] ?? '';
  $('#sidebar').classList.remove('menu-open');
  $('#menu-backdrop').hidden = true;
  $('#menu').setAttribute('aria-expanded', 'false');
  if (view === 'library') renderLibrary();
  if (view === 'privacy') void storageEstimate();
}

async function refreshLibrary() {
  if (!storageAvailable) return;
  try {
    projects = (await listProjects()).sort((a, b) => b.createdAt - a.createdAt);
    $('#library-count').textContent = String(projects.length);
    if (currentView === 'library') renderLibrary();
  } catch {
    storageAvailable = false;
    toast('Armazenamento local indisponível. Você ainda pode assistir e exportar os textos nesta sessão.');
  }
}

function renderLibrary() {
  $('#library-grid').innerHTML = projects.length ? projects.map(p => `<article class="library-card"><div class="library-thumbnail">${icon('file-video')}<span class="badge">${p.video ? 'Vídeo local' : 'Somente textos'}</span></div><div class="library-body"><h2>${escape(p.title)}</h2><p>${formatClock(p.duration)} · ${p.segments.length} trechos · ${new Date(p.createdAt).toLocaleDateString('pt-BR')}</p><div class="library-actions"><button class="button secondary" data-open="${escape(p.id)}">${icon('play')}Abrir projeto</button><button class="icon-button" data-delete="${escape(p.id)}" aria-label="Excluir ${escape(p.title)}">${icon('trash-2')}</button></div></div></article>`).join('') : `<div class="library-empty">${icon('layers')}<h2>Seu aprendizado começa com um vídeo.</h2><p>Os projetos que você criar vão aparecer aqui, apenas neste dispositivo.</p><button class="button primary" data-action="choose-video">${icon('plus')}Adicionar primeiro vídeo</button></div>`;
  icons();
}

async function persist() {
  if (!project || !storageAvailable) return;
  try { await saveProject(project); await refreshLibrary(); }
  catch (error) {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
    toast(quota ? 'Sem espaço para salvar. Exporte o projeto e libere armazenamento local.' : 'Não foi possível salvar neste navegador. Exporte seu projeto para preservar os textos.');
    if (project.video) { delete project.video; $<HTMLInputElement>('#remember').checked = false; }
  }
}

function clearVideo() {
  const video = $<HTMLVideoElement>('#video');
  video.pause();
  video.removeAttribute('src');
  video.querySelectorAll('track').forEach(track => track.remove());
  video.load();
  if (videoURL) URL.revokeObjectURL(videoURL);
  if (captionsURL) URL.revokeObjectURL(captionsURL);
  videoURL = captionsURL = '';
}

function showVideo(blob: Blob) {
  clearVideo();
  videoURL = URL.createObjectURL(blob);
  const video = $<HTMLVideoElement>('#video');
  video.src = videoURL;
  video.hidden = false;
  $('#player-empty').hidden = true;
  $('#reattach').hidden = true;
  video.addEventListener('loadedmetadata', updateCaptions, { once: true });
}

function updateProjectUI() {
  $('#file-title').textContent = project?.title ?? 'Seu próximo treinamento';
  $('#file-detail').textContent = project ? `${formatClock(project.duration)} · ${megabytes(project.size)} · ${project.filename || 'Selecione o vídeo original'}` : 'Adicione um vídeo para começar';
  $('#video-badge').textContent = project?.video ? 'Guardado neste dispositivo' : 'Somente neste dispositivo';
  $<HTMLInputElement>('#remember').checked = Boolean(project?.video);
  $<HTMLInputElement>('#remember').disabled = processing || !project || !currentFile || !storageAvailable;
  $<HTMLButtonElement>('#process').disabled = processing || !project || (!currentFile && !project.segments.length);
  $('#process').innerHTML = `${icon('languages')}${project?.segments.length ? 'Traduzir novamente' : 'Transcrever e traduzir'}`;
  $('#process-title').textContent = project?.segments.length ? 'Seu treinamento, no seu idioma' : 'Traduza sem sair daqui';
  $('#process-description').textContent = project?.segments.length ? 'Clique em um trecho para voltar ao momento no vídeo.' : 'A IA roda no navegador. Nenhuma chave de API necessária.';
  $<HTMLButtonElement>('#export').disabled = !project?.segments.length;
  $<HTMLInputElement>('#search').disabled = !project?.segments.length;
  $('#process').hidden = processing;
  $('#progress-area').hidden = !processing;
  $('#import-captions').toggleAttribute('disabled', processing);
  icons();
}

function renderTranscript() {
  const segments = project?.segments ?? [];
  $('#segment-count').textContent = `${segments.length} ${segments.length === 1 ? 'trecho' : 'trechos'}`;
  if (!segments.length) {
    $('#transcript').innerHTML = `<div class="transcript-empty"><div class="paper-visual">${icon('file-text')}<span></span><span></span><span></span></div><h3>As palavras vão aparecer aqui</h3><p>${processing ? 'Estamos preparando a transcrição.<br>O conteúdo continua no seu dispositivo.' : 'Transcreva seu vídeo para acompanhar<br>cada trecho em português.'}</p><span class="tiny-pill">${icon('clock-3')}Sincronizado com a reprodução</span></div>`;
  } else {
    const query = $<HTMLInputElement>('#search').value.toLocaleLowerCase('pt-BR').trim();
    const matched = segments.map((s, i) => ({ s, i })).filter(({ s }) => !query || `${s.original} ${s.translated}`.toLocaleLowerCase('pt-BR').includes(query));
    $('#transcript').innerHTML = matched.map(({ s, i }) => `<article class="segment ${i === active ? 'is-active' : ''}" data-segment="${i}"><div class="segment-meta"><button class="time-button" data-seek="${i}" aria-label="Ir para ${formatClock(s.start)}">${formatClock(s.start)}<span>${icon('play')}</span></button><button class="icon-button edit-button" data-edit="${i}" aria-label="Editar trecho ${i + 1}">${icon('pencil')}</button></div><button class="segment-text" data-seek="${i}">${selectedLanguage !== 'original' ? `<span class="translation">${escape(s.translated || 'Tradução ainda não gerada')}</span>` : ''}${selectedLanguage !== 'translated' ? `<span class="original">${escape(s.original)}</span>` : ''}</button></article>`).join('') || `<div class="no-results">Nenhum trecho encontrado.</div>`;
  }
  icons();
}

function updateCaptions() {
  const video = $<HTMLVideoElement>('#video');
  video.querySelectorAll('track').forEach(track => track.remove());
  if (captionsURL) URL.revokeObjectURL(captionsURL);
  captionsURL = '';
  const language = $<HTMLSelectElement>('#caption-language').value;
  if (!project?.segments.length || language === 'off') return;
  const captions = project.segments.map(s => ({ ...s, translated: language === 'both' ? `${s.translated || s.original}\n${s.translated ? s.original : ''}` : language === 'original' ? s.original : s.translated || s.original }));
  captionsURL = URL.createObjectURL(new Blob([exportSubtitles(captions, 'translated', 'vtt')], { type: 'text/vtt' }));
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = language === 'original' ? 'English' : 'Português';
  track.srclang = language === 'original' ? 'en' : 'pt-BR';
  track.src = captionsURL;
  track.default = true;
  video.append(track);
  track.track.mode = 'showing';
}

function cancelProcessing(silent = false) {
  worker?.terminate();
  worker = undefined;
  processing = false;
  updateProjectUI();
  if (!silent) toast('Processamento cancelado. Seu vídeo continua disponível.');
}

async function chooseVideo(file: File) {
  if (processing) { toast('Cancele o processamento atual antes de trocar de vídeo.'); return; }
  if (file.size > 500 * 1024 * 1024) { toast('Escolha um vídeo de até 500 MB.'); return; }
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv)$/i.test(file.name)) { toast('Escolha um arquivo de vídeo MP4, WebM, MOV ou MKV.'); return; }
  if (attachToProject && project && ((project.filename && file.name !== project.filename) || (project.size && file.size !== project.size))) {
    attachToProject = false;
    toast('Este arquivo não corresponde ao projeto. Selecione o vídeo original com o mesmo nome e tamanho.');
    return;
  }
  const attaching = attachToProject;
  attachToProject = false;
  const previous = project;
  const previousFile = currentFile;
  showVideo(file);
  const video = $<HTMLVideoElement>('#video');
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('O navegador não conseguiu abrir este vídeo.')), 15000);
      const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); error ? reject(error) : resolve(); };
      const loaded = () => finish();
      const failed = () => finish(new Error('Formato ou codec incompatível com este navegador. Tente um MP4 com vídeo H.264 e áudio AAC.'));
      video.addEventListener('loadedmetadata', loaded, { once: true });
      video.addEventListener('error', failed, { once: true });
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Não foi possível identificar a duração do vídeo.');
    if (video.duration > 1800) throw new Error('Escolha um vídeo de até 30 minutos. Divida treinamentos maiores em partes.');
    currentFile = file;
    if (!attaching) {
      project = projects.find(p => p.filename === file.name && p.size === file.size && p.lastModified === file.lastModified) ?? {
        id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), filename: file.name, size: file.size,
        lastModified: file.lastModified, duration: video.duration, createdAt: Date.now(), segments: [],
      };
    } else {
      project = { ...project!, filename: file.name, size: file.size, lastModified: file.lastModified, duration: video.duration };
    }
    active = -1;
    $<HTMLInputElement>('#search').value = '';
    $('#error-panel').hidden = true;
    changeView('workspace');
    updateProjectUI(); renderTranscript(); updateCaptions();
    await persist();
  } catch (error) {
    project = previous; currentFile = previousFile;
    clearVideo();
    if (previousFile) showVideo(previousFile);
    else { $('#video').hidden = true; $('#player-empty').hidden = Boolean(project); $('#reattach').hidden = !project; }
    updateProjectUI();
    toast(error instanceof Error ? error.message : 'Não foi possível abrir o vídeo.');
  }
}

function startProcessing() {
  if (processing || !project || (!currentFile && !project.segments.length)) return;
  if (!window.Worker || !window.WebAssembly) { toast('Este navegador não suporta o processamento local. Use uma versão atual do Chrome, Edge, Firefox ou Safari.'); return; }
  processing = true;
  const targetID = project.id;
  $('#error-panel').hidden = true;
  $('#progress-bar').style.width = '4%';
  $('#progress-message').textContent = 'Preparando o processamento local…';
  updateProjectUI(); renderTranscript();
  worker ??= new Worker(new URL('./processor.worker.ts', import.meta.url), { type: 'module' });
  const fail = (message: string) => {
    cancelProcessing(true);
    $('#error-panel').hidden = false;
    $('#error-message').textContent = /audio|áudio|30 minutos|fala/.test(message) ? message : 'Não foi possível carregar ou executar os modelos. Verifique a conexão no primeiro uso, o espaço disponível e a memória do dispositivo. Tente um vídeo menor ou importe uma legenda. Os arquivos continuam locais.';
    $('#error-detail').textContent = message;
    renderTranscript();
  };
  worker.onerror = event => { event.preventDefault(); fail(event.message || 'Falha no processamento do navegador.'); };
  worker.onmessage = async (event: MessageEvent<WorkerEvent>) => {
    if (project?.id !== targetID) return;
    const data = event.data;
    if (data.type === 'status') {
      $('#progress-message').textContent = data.message;
      const value = data.stage === 'audio' ? 5 : data.stage === 'models' ? 10 + (data.progress ?? 0) * .3 : data.stage === 'transcribe' ? 48 : 65 + (data.progress ?? 0) * .35;
      $('#progress-bar').style.width = `${value}%`;
    } else if (data.type === 'transcribed') {
      project.segments = data.segments;
      updateProjectUI(); renderTranscript(); updateCaptions(); await persist();
    } else if (data.type === 'error') fail(data.message);
    else if (data.type === 'complete') {
      project.segments = data.segments;
      cancelProcessing(true);
      active = activeSegment(project.segments, $<HTMLVideoElement>('#video').currentTime);
      updateProjectUI(); renderTranscript(); updateCaptions();
      await persist();
      toast('Tradução concluída. Dê play e acompanhe as legendas.');
    }
  };
  worker.postMessage({ file: currentFile, segments: project.segments.length ? project.segments : undefined, baseURL: appURL.href });
}

async function openProject(id: string) {
  if (processing) { toast('Cancele o processamento antes de abrir outro projeto.'); return; }
  const selected = projects.find(p => p.id === id);
  if (!selected) return;
  project = selected;
  currentFile = selected.video ? new File([selected.video], selected.filename, { type: selected.video.type, lastModified: selected.lastModified }) : undefined;
  clearVideo();
  if (selected.video) showVideo(selected.video);
  else { $('#video').hidden = true; $('#player-empty').hidden = true; $('#reattach').hidden = false; }
  active = -1;
  $<HTMLInputElement>('#search').value = '';
  $('#error-panel').hidden = true;
  changeView('workspace'); updateProjectUI(); renderTranscript();
}

function download(text: string, extension: string, type: string) {
  const blobURL = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = blobURL;
  link.download = `${(project?.title ?? 'entrelinhas').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
}

function exportDialog() {
  if (!project?.segments.length) return;
  dialog(`<div class="dialog-symbol">${icon('download')}</div><h2>Leve as palavras com você.</h2><p>Arquivos exportados não incluem o vídeo. Guarde-os em um local adequado para conteúdo interno.</p><label class="field-label">Idioma<select id="export-language"><option value="translated">Português</option><option value="original">Inglês</option></select></label><div class="export-options"><button class="button secondary" data-format="srt">${icon('captions')}Legenda SRT</button><button class="button secondary" data-format="vtt">${icon('captions')}Legenda VTT</button><button class="button secondary" data-format="txt">${icon('file-text')}Texto completo</button><button class="button secondary" data-format="json">${icon('layers')}Projeto (ambos os idiomas)</button></div><p class="dialog-note">O projeto JSON preserva os tempos e textos para importar depois. O vídeo deve ser guardado separadamente.</p>`);
}

function editSegment(index: number) {
  const segment = project?.segments[index];
  if (!segment || processing) return;
  dialog(`<h2>Revise este trecho</h2><p>Ajuste termos do treinamento e a tradução para PT-BR.</p><form id="edit-form"><div class="time-fields"><label class="field-label">Início (segundos)<input type="number" step="0.01" min="0" id="edit-start" value="${segment.start}" required /></label><label class="field-label">Fim (segundos)<input type="number" step="0.01" min="0" id="edit-end" value="${segment.end}" required /></label></div><label class="field-label">Original em inglês<textarea id="edit-original" rows="3" required>${escape(segment.original)}</textarea></label><label class="field-label">Tradução em português<textarea id="edit-translated" rows="3">${escape(segment.translated)}</textarea></label><p id="edit-error" class="field-error" role="alert"></p><button class="button primary" type="submit">${icon('check')}Salvar alterações</button></form>`);
  $('#edit-form').addEventListener('submit', async () => {
    const start = Number($<HTMLInputElement>('#edit-start').value);
    const end = Number($<HTMLInputElement>('#edit-end').value);
    const original = $<HTMLTextAreaElement>('#edit-original').value.trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || (project!.duration > 0 && end > project!.duration + .1) || !original) {
      $('#edit-error').textContent = 'Confira os tempos: o fim deve ser maior que o início e estar dentro do vídeo.'; return;
    }
    project!.segments[index] = { start, end, original, translated: $<HTMLTextAreaElement>('#edit-translated').value.trim() };
    project!.segments.sort((a, b) => a.start - b.start);
    $<HTMLDialogElement>('#dialog').close();
    renderTranscript(); updateCaptions(); await persist();
  });
}

async function storageEstimate() {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  $('#storage-estimate').textContent = estimate ? `Este site usa aproximadamente ${megabytes(estimate.usage ?? 0)} dos ${megabytes(estimate.quota ?? 0)} disponíveis para esta origem.` : 'O navegador não informa o espaço disponível.';
}

document.addEventListener('click', async event => {
  const target = (event.target as Element).closest<HTMLElement>('button, [data-view]');
  if (!target) return;
  const action = target.dataset.action;
  if (target.dataset.view) changeView(target.dataset.view);
  if (action === 'choose-video') {
    attachToProject = false;
    $<HTMLInputElement>('#video-input').click();
  }
  if (action === 'close-dialog') $<HTMLDialogElement>('#dialog').close();
  if (action === 'storage-help') dialog(`<div class="dialog-symbol">${icon('hard-drive')}</div><h2>Disponível só para você.</h2><p>Com a opção desativada, o vídeo fica apenas na memória da sessão. Os textos ficam na biblioteca local e você pode selecionar o vídeo novamente depois.</p><p>Com a opção ativada, uma cópia do vídeo fica no armazenamento deste navegador, sem upload. Ela estará disponível aqui, inclusive offline.</p><p>O navegador pode remover dados se faltar espaço. Limpar os dados do site também apaga a biblioteca. Mantenha o arquivo original e exporte um backup dos textos.</p>`);
  if (target.dataset.open) await openProject(target.dataset.open);
  if (target.dataset.delete) {
    const id = target.dataset.delete;
    if (processing && project?.id === id) { toast('Cancele o processamento antes de excluir este projeto.'); return; }
    dialog(`<h2>Excluir este projeto?</h2><p>A transcrição e a cópia local do vídeo serão removidas deste navegador. O arquivo original não será alterado.</p><button class="button danger" id="confirm-delete">${icon('trash-2')}Excluir projeto</button>`);
    $('#confirm-delete').addEventListener('click', async () => {
      try {
        await deleteProject(id);
        if (project?.id === id) { clearVideo(); project = undefined; currentFile = undefined; $('#video').hidden = true; $('#reattach').hidden = true; $('#player-empty').hidden = false; updateProjectUI(); renderTranscript(); }
        await refreshLibrary(); $<HTMLDialogElement>('#dialog').close(); toast('Projeto removido deste dispositivo.');
      } catch { toast('Não foi possível excluir o projeto.'); }
    });
  }
  if (target.dataset.language) {
    selectedLanguage = target.dataset.language as typeof selectedLanguage;
    document.querySelectorAll('[data-language]').forEach(el => { const selected = el === target; el.classList.toggle('active', selected); el.setAttribute('aria-selected', String(selected)); });
    renderTranscript();
  }
  if (target.dataset.seek !== undefined) {
    if (!videoURL) { toast('Selecione o vídeo original para navegar entre os trechos.'); return; }
    $<HTMLVideoElement>('#video').currentTime = project!.segments[Number(target.dataset.seek)].start;
  }
  if (target.dataset.edit !== undefined) editSegment(Number(target.dataset.edit));
  if (target.dataset.format && project) {
    const format = target.dataset.format;
    const language = $<HTMLSelectElement>('#export-language').value;
    if (format === 'json') {
      const { video: _video, ...data } = project;
      download(JSON.stringify({ version: 1, ...data }, null, 2), 'json', 'application/json');
    } else if (format === 'txt') download(project.segments.map(s => `[${formatClock(s.start)}] ${language === 'original' ? s.original : s.translated || s.original}`).join('\n\n'), 'txt', 'text/plain');
    else download(exportSubtitles(project.segments, language, format), format, format === 'vtt' ? 'text/vtt' : 'text/plain');
  }
});

$<HTMLInputElement>('#video-input').addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void chooseVideo(file);
  input.value = '';
});
$('#reattach-button').addEventListener('click', () => { attachToProject = true; $<HTMLInputElement>('#video-input').click(); });
$('#dropzone').addEventListener('dragover', event => { event.preventDefault(); $('#dropzone').classList.add('dragging'); });
$('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragging'));
$('#dropzone').addEventListener('drop', event => {
  event.preventDefault(); $('#dropzone').classList.remove('dragging');
  const file = (event as DragEvent).dataTransfer?.files[0];
  if (file) { attachToProject = false; void chooseVideo(file); }
});
// Avoid accidental browser navigation when a file is dropped outside the player.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());

$('#process').addEventListener('click', startProcessing);
$('#cancel').addEventListener('click', () => cancelProcessing());
$('#export').addEventListener('click', exportDialog);
$('#search').addEventListener('input', renderTranscript);
$('#caption-language').addEventListener('change', updateCaptions);
$('#menu').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('menu-open');
  $('#menu-backdrop').hidden = !open;
  $('#menu').setAttribute('aria-expanded', String(open));
});
function closeMenu() {
  $('#sidebar').classList.remove('menu-open');
  $('#menu-backdrop').hidden = true;
  $('#menu').setAttribute('aria-expanded', 'false');
}
$('#menu-backdrop').addEventListener('click', closeMenu);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
$('#remember').addEventListener('change', async () => {
  if (!project || !currentFile) return;
  if ($<HTMLInputElement>('#remember').checked) {
    project.video = currentFile;
    if (navigator.storage?.persist) {
      const retained = await navigator.storage.persist().catch(() => false);
      if (!retained) toast('O vídeo será salvo localmente, mas o navegador pode removê-lo se faltar espaço.');
    }
  } else delete project.video;
  await persist(); updateProjectUI();
});

$<HTMLVideoElement>('#video').addEventListener('timeupdate', () => {
  if (!project) return;
  const next = activeSegment(project.segments, $<HTMLVideoElement>('#video').currentTime);
  if (active === next) return;
  active = next;
  document.querySelectorAll('.segment').forEach(el => el.classList.toggle('is-active', el.getAttribute('data-segment') === String(active)));
  if ($<HTMLInputElement>('#follow').checked && active >= 0) {
    const row = document.querySelector<HTMLElement>(`[data-segment="${active}"]`);
    const pane = $('#transcript');
    if (row) {
      const offset = row.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      if (offset < 0 || offset + row.offsetHeight > pane.clientHeight) pane.scrollTo({ top: pane.scrollTop + offset - 12, behavior: 'smooth' });
    }
  }
});

$('#import-captions').addEventListener('click', () => {
  if (!project) { toast('Adicione um vídeo primeiro para associar as legendas.'); return; }
  if (processing) return;
  $<HTMLInputElement>('#captions-input').click();
});
$<HTMLInputElement>('#captions-input').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  try {
    if (!file || !project) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('Use uma legenda de até 5 MB.');
    const segments = parseSubtitles(await file.text()) as Segment[];
    if (segments.some(s => s.end > project!.duration + 1)) throw new Error('Os tempos da legenda ultrapassam a duração do vídeo. Confira se é o arquivo certo.');
    if (project.segments.length && !confirm('Substituir os textos deste projeto pelas legendas importadas? Exporte um backup antes se precisar.')) return;
    project.segments = segments;
    updateProjectUI(); renderTranscript(); updateCaptions(); await persist();
    toast('Legenda em inglês importada. Clique em Traduzir novamente para gerar o português.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível importar a legenda.'); }
  finally { input.value = ''; }
});

$('#import-project').addEventListener('click', () => {
  if (processing) { toast('Cancele o processamento antes de importar outro projeto.'); return; }
  $<HTMLInputElement>('#project-input').click();
});
$<HTMLInputElement>('#project-input').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  try {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('Use um projeto JSON de até 10 MB.');
    const data = validateProject(JSON.parse(await file.text()));
    project = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
    currentFile = undefined;
    clearVideo(); $('#video').hidden = true; $('#player-empty').hidden = true; $('#reattach').hidden = false;
    active = -1;
    $<HTMLInputElement>('#search').value = '';
    $('#error-panel').hidden = true;
    await persist(); changeView('workspace'); updateProjectUI(); renderTranscript();
    toast('Projeto importado. Selecione o vídeo original para assistir.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Projeto inválido.'); }
  finally { input.value = ''; }
});

$('#clear-data').addEventListener('click', () => {
  if (processing) { toast('Cancele o processamento antes de apagar os dados.'); return; }
  dialog(`<h2>Apagar os dados locais?</h2><p>Isso remove todos os projetos, vídeos guardados e modelos de IA deste navegador. O aplicativo continua instalado. Você precisará baixar os modelos novamente.</p><p>Exporte seus projetos antes. Esta ação não pode ser desfeita.</p><button class="button danger" id="confirm-clear">${icon('trash-2')}Apagar dados locais</button>`);
  $('#confirm-clear').addEventListener('click', async () => {
    try {
      cancelProcessing(true); await removeLocalData();
      project = undefined; currentFile = undefined; clearVideo();
      $('#video').hidden = true; $('#reattach').hidden = true; $('#player-empty').hidden = false;
      $('#error-panel').hidden = true;
      $<HTMLInputElement>('#search').value = '';
      await refreshLibrary(); updateProjectUI(); renderTranscript(); await storageEstimate();
      $<HTMLDialogElement>('#dialog').close(); toast('Biblioteca e modelos locais removidos.');
    } catch { toast('Não foi possível apagar todos os dados. Use as configurações de armazenamento do navegador.'); }
  });
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event as typeof installPrompt;
});
window.addEventListener('appinstalled', () => { installPrompt = undefined; toast('Entrelinhas instalado neste dispositivo.'); });
$('#install').addEventListener('click', async () => {
  if (installPrompt) {
    await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = undefined;
  } else {
    dialog(`<div class="dialog-symbol">${icon('monitor-smartphone')}</div><h2>Seu espaço, sempre por perto.</h2><p>Abra este site por HTTPS em um navegador compatível.</p><ol><li><strong>Android / Chrome:</strong> menu ⋮ → “Instalar aplicativo” ou “Adicionar à tela inicial”.</li><li><strong>iPhone / iPad / Safari:</strong> Compartilhar → “Adicionar à Tela de Início”.</li><li><strong>Desktop / Chrome ou Edge:</strong> ícone de instalação na barra de endereço ou menu → “Instalar”.</li><li><strong>macOS / Safari:</strong> Arquivo → “Adicionar ao Dock”, nas versões compatíveis.</li></ol><p class="dialog-note">Instalar não sincroniza dados entre dispositivos. Sua biblioteca pertence a este navegador.</p>`);
  }
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', appURL), { scope: appURL.pathname }).catch(() => toast('O modo offline não pôde ser ativado. O aplicativo ainda funciona online.'));
  });
}
window.addEventListener('offline', () => toast('Você está offline. Vídeos locais continuam disponíveis; a IA precisa dos modelos completos em cache.'));
window.addEventListener('beforeunload', event => {
  if (processing) { event.preventDefault(); }
});
updateProjectUI();
void refreshLibrary();
