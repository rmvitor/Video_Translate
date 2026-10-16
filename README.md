# Entrelinhas

PWA para compreender vídeos e PDFs em outros idiomas, acompanhar projetos, preservar imagens e narrar em PT-BR. Inclui tradução local, tradução/análise opcional de texto com Gemini e controle de acesso preparado para Supabase.

**Versão 0.4:** login e painel master precisam de um projeto Supabase configurado. Sem configuração, o novo build exibe a tela de preparação. Consulte [o guia de ativação](docs/SUPABASE_SETUP.md) antes de levar essa versão ao Pages. O site é estático e pode ser publicado no GitHub Pages; arquivos e textos são processados no dispositivo.

## Usuários e backup

O master aprova/bloqueia contas, define prazos e duração de sessão e consulta IP, horários e histórico de acesso. Supabase armazena somente autenticação e dados de autorização/auditoria; bibliotecas de treinamentos permanecem em bancos locais separados por conta.

**Preferências → Backup local e transferência** exporta um arquivo criptografado com senha, incluindo organização, textos, imagens, análises e progresso, além de vídeos guardados quando selecionados. A restauração mescla os dados sem substituir registros existentes. O arquivo e a senha são transferidos localmente; nenhum backup ou conteúdo é enviado ao Supabase.

Siga [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) para criar o projeto, aplicar a migração, publicar a função e definir sua conta master.

## Desenvolvimento

Requisitos: Node.js 22.12+ (ou 24), npm e um navegador atual com WebAssembly, Web Workers e IndexedDB.

```sh
# O projeto usa ONNX no navegador. Não precisa dos binários CUDA para Node.
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm run dev
```

No PowerShell, defina `$env:ONNXRUNTIME_NODE_INSTALL_CUDA="skip"` antes de `npm ci`. Os modelos locais não precisam de chave de IA. O acesso à ferramenta exige Supabase configurado, aprovação e renovação de autorização online. O Gemini é opcional e usa uma chave pessoal informada na interface, somente na memória da sessão.

```sh
npm test
npm run build
npm run preview
```

`prepare:assets` copia os runtimes verificados dos pacotes npm para `public/runtime/`, uma pasta gerada e ignorada pelo Git. A configuração `base: './'` e o service worker usam caminhos relativos para funcionar em `/Video_Translate/` e em um domínio próprio. O build contém os runtimes WebAssembly e tem dezenas de MB; os modelos são baixados separadamente.

## Usar a ferramenta

1. Adicione um vídeo (até 500 MB e 30 minutos). MP4 com H.264/AAC oferece maior compatibilidade entre navegadores. Outros formatos dependem do suporte do navegador para reprodução.
2. Clique em **Transcrever e traduzir**. FFmpeg WASM extrai áudio mono a 16 kHz em um worker. Whisper transcreve com tempos no idioma original selecionado; Marian traduz inglês para português e M2M100 traduz os demais idiomas. Os modelos de outros idiomas são maiores (a tradução pode baixar mais de 600 MB). Os modelos quantizados executam na CPU via WebAssembly, sem exigir WebGPU ou cabeçalhos de isolamento incompatíveis com o Pages.
3. Assista com legendas em português, idioma original ou nos dois idiomas. A transcrição destaca o trecho atual; clique em um trecho para navegar no vídeo. Busque ou edite textos e tempos para corrigir nomes e termos da empresa.
4. Use **Baixar vídeo** para gerar um MP4 local com áudio PT-BR, áudio original ou duas faixas e legenda fixa ou selecionável ([opções e limites](docs/VIDEO_EXPORT.md)). Também é possível exportar SRT, VTT, texto ou projeto JSON. O JSON inclui os textos e tempos dos dois idiomas, sem incluir o vídeo. Uma legenda SRT/VTT no idioma original pode ser importada para tradução, evitando a etapa de transcrição.
5. Abra a **Minha biblioteca** para retomar um projeto. Sem uma cópia local, selecione novamente o vídeo original. Ative **Guardar vídeo neste dispositivo** para manter uma cópia no IndexedDB e assistir depois sem selecionar o arquivo novamente.

A tradução automática pode conter erros e o modelo multilíngue pode produzir termos de português europeu. A ferramenta prefere o token de português brasileiro quando presente no vocabulário do modelo, e permite revisão manual para adequar o texto a PT-BR. Não considere a transcrição uma reprodução exata do treinamento sem revisão, especialmente em termos técnicos.

## Projetos, subassuntos e páginas PDF

Em **Projetos e assuntos**, crie um projeto com título e seus subassuntos. Abra um assunto e use **Adicionar PDF** ou **Adicionar vídeo** para associar o material diretamente. Os seletores de projeto e subassunto no player/leitor também permitem organizar materiais existentes. Renomear ou remover uma organização preserva seus PDFs e vídeos nas bibliotecas.

Ao abrir um projeto, a lateral agrupa os materiais por subassunto e o painel ao lado exibe o vídeo ou a página PDF. Use **Anterior/Próximo**, marque cada material como concluído e acompanhe a barra de progresso. O último material aberto é retomado ao voltar ao projeto; notas, progresso e organização ficam neste navegador. Escolha um subassunto para associar os próximos arquivos adicionados. Isso serve para acompanhar o conteúdo e o trabalho de um projeto, sem exercícios de aprendizado de inglês.

Em **Páginas PDF**, adicione um PDF com texto selecionável (até 50 MB e 100 páginas). PDF.js lê os parágrafos e imagens localmente. Clique em **Traduzir textos pendentes** para gerar o português com o mesmo modelo local utilizado nos vídeos. Traduções concluídas são guardadas progressivamente; após uma interrupção, o botão retoma os trechos pendentes.

Cada página apresenta os textos e imagens na ordem aproximada de leitura. As imagens mantêm proporções próximas às do PDF e podem ser abertas em tamanho original. Elementos totalmente vazios ficam recolhidos. A opção **Ver página original e elementos gráficos** preserva a composição completa, inclusive gráficos vetoriais que não puderam ser separados. O leitor produz uma página de leitura, sem prometer uma reprodução exata do layout editorial do PDF.

Revise um parágrafo pelo botão de edição. **Exportar página HTML** gera um arquivo autônomo com os textos e imagens incorporados, que pode ser aberto sem internet. Esse arquivo contém conteúdo interno: guarde-o em um local apropriado e não o envie ao GitHub. O PDF original não é armazenado nem enviado; os textos e imagens extraídos ficam no IndexedDB local para acesso posterior. PDFs escaneados sem camada de texto mantêm as imagens, mas OCR não está incluído nesta versão.

## Gemini e aparência

Em **Preferências**, escolha tema claro, escuro ou seguindo o sistema e a cor do aplicativo. As preferências ficam no `localStorage`, separadas da biblioteca. A cor dos textos e dos botões se ajusta para manter contraste legível; as imagens originais não são invertidas no tema escuro.

Para usar **Gemini 2.5 Flash**, informe sua chave pessoal em Preferências ou no diálogo de tradução. Ela fica somente na memória da aba/sessão, não é salva no IndexedDB, `localStorage`, exports ou código público. Recarregar o aplicativo remove a chave. O serviço depende da sua conexão, chave, permissões e cota.

No vídeo, escolha **Só transcrever localmente** se quiser traduzir com Gemini, evitando o download do modelo local de tradução. A extração de áudio e a transcrição continuam no dispositivo. Em um vídeo com legendas importadas, o texto já está disponível. No PDF, basta importar para extrair texto e imagens localmente.

Use **Traduzir texto com Gemini** ou **Analisar texto com Gemini** no material aberto. Revise a lista, marque os trechos necessários e autorize o envio. São enviados somente esses textos ao endpoint `generativelanguage.googleapis.com`, sem nome de arquivo, metadados do projeto, mídia ou imagens. Cada envio aceita até 100 trechos e 16.000 caracteres; divida materiais longos usando a seleção de trechos. A chave segue em cabeçalho HTTPS, sem aparecer na URL.

O resultado só é salvo depois de **Aplicar traduções revisadas** ou **Salvar análise neste material**. As traduções mantêm os tempos das legendas; a análise apresenta resumo, pontos principais e dúvidas a verificar. Erros de cota, conexão ou formato de resposta preservam os textos existentes. Texto selecionado deixa o dispositivo quando autorizado e passa a ser tratado pelo Google conforme os termos do serviço. A narração continua exclusivamente local, inclusive quando a tradução veio do Gemini.

## Narração contínua em PT-BR e inglês

No vídeo, ative **Narrar em PT-BR + inglês**. A voz natural prepara uma sequência de áudio completa antes de começar; aguarde **Narração contínua pronta** e dê play. Os limites dos trechos não interrompem a fala e **não pausam o vídeo automaticamente**. O ritmo da fala se ajusta ao tempo do vídeo entre 0,6× e 2×, preservando o tom. Se o texto ainda demorar mais, a narração termina depois do vídeo, sem cortar palavras. Pausas e buscas feitas pelo usuário continuam funcionando; uma busca começa a leitura pelo trecho correspondente. Ao desligar, o estado anterior de silenciamento é restaurado, salvo se você alterou o controle manualmente.

Nas páginas PDF, **Ler em PT-BR + inglês** lê os trechos traduzidos em sequência e destaca o parágrafo atual. É possível ler um trecho individual, pausar, continuar e parar. Em **Organização, idioma e voz**, escolha **PT-BR + termos em inglês**, **Somente PT-BR** ou **Inglês (texto original)**. O modo inglês exige texto original em inglês e também lê parágrafos ainda sem tradução.

Termos como **Insight** e **Home Management** usam pronúncia inglesa no modo misto. Rótulos preservados do original em inglês também podem ser reconhecidos. O campo **Outros termos para pronunciar em inglês** permite acrescentar expressões separadas por vírgulas. Esses ajustes pertencem ao material, ficam na biblioteca local de cada conta e entram no backup criptografado; não alteram a tradução nem são enviados ao Supabase.

A voz natural usa Faber para português e LJSpeech para inglês, ambas geradas no dispositivo. **Preparar vozes** baixa os modelos necessários uma vez; modelos completos em cache podem ser usados offline. A narração não envia texto, áudio nem arquivos para serviços de voz. Vozes do sistema são aceitas somente quando o navegador informa que são locais, em PT-BR ou inglês. Se não houver voz inglesa local no sistema, a leitura mista usa as vozes naturais locais.

## Privacidade e armazenamento

- O app não tem servidor de upload de conteúdo ou analytics. Supabase gerencia e-mail, sessões, IP e horários de acesso. A chave pessoal do Gemini, se informada, existe somente na memória da sessão. Os vídeos são reproduzidos com URLs `blob:`. Vídeo e áudio não são enviados para serviços de IA.
- A interface e os runtimes são servidos pelo Pages. Os modelos de `Xenova/whisper-base.en`, `Xenova/whisper-base`, `Xenova/whisper-small.en` e `Xenova/whisper-small`, `Xenova/opus-mt-en-ROMANCE` e `Xenova/m2m100_418M` são baixados do Hugging Face via HTTPS. Esses downloads são requisições GET sem o conteúdo do vídeo. O provedor de download pode observar os metadados usuais de conexão, como IP e modelo solicitado.
- As transcrições, traduções, projetos, subassuntos e imagens das páginas PDF são salvos no IndexedDB deste navegador. O vídeo fica apenas na sessão por padrão; a cópia persistente exige ativar a opção na tela. A atualização do banco preserva os vídeos e legendas criados antes da versão 0.2.
- O app não criptografa a biblioteca. Use um perfil confiável, principalmente para conteúdo interno. Sites no mesmo domínio/origem compartilham os limites de segurança de armazenamento do navegador; tenha cuidado com outros projetos publicados no mesmo domínio do Pages.
- Não há sincronização entre celulares e computadores. O navegador pode remover dados por pressão de armazenamento; modo privado, reinstalação e limpeza do site podem apagar a biblioteca. Mantenha os arquivos originais e backups JSON em locais adequados para dados internos.
- Em **Privacidade**, é possível excluir a biblioteca e os modelos em cache. Excluir um projeto remove somente a cópia do app; não altera o arquivo original.
- Vídeos internos, arquivos de transcrição e projetos exportados não devem ser adicionados ao repositório. O vídeo enviado na conversa não faz parte do código ou dos assets públicos.

## PWA e modo offline

Abra por HTTPS (ou localhost durante desenvolvimento). Chrome e Edge oferecem instalação no desktop/Android; no iOS, use Safari → Compartilhar → Adicionar à Tela de Início. A disponibilidade do comando de instalação depende do navegador.

O service worker guarda a interface e os runtimes da versão atual; não intercepta vídeos `blob:` nem uploads. O login e a renovação de acesso exigem internet. A interface é suspensa após perder a autorização, em até 65 segundos, preservando a biblioteca. Os modelos completos ficam no cache do Transformers.js. Os modelos baixados podem executar localmente; isso não dispensa a autorização online nesta versão. O cache da interface não garante que os modelos tenham terminado de baixar.

O primeiro uso baixa centenas de MB. Downloads e processamento exigem espaço e memória; vídeos longos e celulares modestos podem esgotar memória ou ficar lentos. A aba deve permanecer aberta durante o processamento. Cancelar encerra o worker. Em dispositivos que não suportam a execução, importe um projeto com legendas criado em outro dispositivo.

## Publicar no GitHub Pages

O workflow em `.github/workflows/pages.yml` instala com `npm ci`, executa os testes unitários, gera a PWA e publica somente `dist/` quando há um push em `main` ou uma execução manual. Ele não inclui vídeos locais.

1. Envie o código para o repositório e a branch `main`.
2. No GitHub, abra **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Execute ou aguarde o workflow **Publicar no GitHub Pages**.
4. Abra a URL exibida pelo GitHub e valide a instalação e um processamento no seu dispositivo.

O workflow está preparado no código; criar os arquivos localmente não publica o site.

Use somente esse workflow para publicar o Entrelinhas. Um workflow Jekyll paralelo publica o código-fonte sem compilação e pode sobrescrever a PWA. O identificador de instalação é `/Video_Translate/`; os caminhos relativos de início e escopo ficam restritos ao diretório do aplicativo. O membro `id` do manifest é resolvido contra a origem, e não contra a pasta: `id: "./"` faria outros aplicativos do mesmo domínio compartilharem a identidade.

Se uma instalação antiga confundiu o Entrelinhas com o Implanta, abra os endereços de cada projeto no navegador e instale as versões com os IDs corrigidos. Remova o atalho/aplicativo antigo que ficou com o nome errado, mantendo desmarcada qualquer opção de apagar dados do site. Não limpe os dados do domínio: isso poderia apagar bibliotecas e informações locais dos dois aplicativos.

## Testes de navegador

Os testes usam um servidor estático com o prefixo `/Video_Translate/`, reproduzindo o caminho do Pages. Eles verificam reprodução local, importação, edição, sincronização, exportação, persistência, exclusão, layout mobile, escape de textos e o shell offline. Também exercitam a extração real de áudio com FFmpeg WASM.

```sh
# Linux com Chromium e FFmpeg instalados:
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Em outra instalação, use `npx playwright install chromium` e informe o caminho do executável em `CHROMIUM_PATH`. O teste de falha de download bloqueia explicitamente o destino dos modelos: ele verifica extração de áudio e tratamento do erro, e não demonstra inferência bem-sucedida. O teste gera um vídeo sintético em uma pasta temporária. `EXAMPLE_VIDEO=/caminho/privado/video.mp4` permite exercitar a extração com outro arquivo sem copiá-lo para o repositório.

Os testes de materiais geram um PDF sintético com texto e imagem. `EXAMPLE_PDF=/caminho/privado/documento.pdf` permite executar esse fluxo com outro PDF. A narração é verificada com uma simulação controlada do serviço de voz local: pausa, retomada, leitura de trechos, sincronização e silenciamento. Essa simulação não comprova saída de som em um dispositivo real. Vozes remotas são explicitamente testadas como não permitidas.

### Inferência real e validação nesta entrega

Com o servidor de testes rodando (`node scripts/test-server.mjs`), é possível validar os modelos completos com um arquivo local:

```sh
VIDEO_INPUT=/caminho/privado/video.mp4 npm run test:ai
PDF_INPUT=/caminho/privado/documento.pdf npm run test:pdf
```

Esse teste exige acesso aos modelos, espaço e memória. Verifica a extração, transcrição, tradução, tempos válidos e textos distintos nos dois idiomas, sem imprimir o conteúdo privado. Em seguida desativa a conexão e processa o vídeo inteiro novamente com os modelos em cache. Na versão 0.4, esses scripts usam autorização local simulada para isolar o teste dos modelos; isso não demonstra login offline ou o Supabase hospedado. No runner de nuvem, usa `curl` para transportar somente os downloads GET pelo proxy HTTPS configurado, mantendo a verificação TLS; a extração e a inferência executam nos workers WebAssembly reais do Chromium. Em um navegador do usuário, o aplicativo baixa os modelos diretamente, sem essa adaptação de testes.

Os testes de conteúdo introduzidos na versão 0.3 validam organização em lateral, navegação entre vídeo/PDF, retomada, progresso, notas, tema/cor, persistência e privacidade dos pedidos online. A integração Gemini é testada com respostas controladas e uma chave fictícia; nenhuma chamada real com chave pessoal foi feita neste ambiente. A qualidade e disponibilidade do serviço devem ser conferidas usando a chave no aplicativo.

O vídeo de exemplo foi revalidado com FFmpeg, Whisper e Marian reais no Chromium, produzindo cinco trechos traduzidos, seguido de processamento completo offline com os modelos em cache. Uma tradução sintética de espanhol para português também passou com M2M100 real; no runner, os pesos grandes foram transportados por um servidor local de testes para contornar o limite de tamanho do canal DevTools, sem alterar o aplicativo publicado. O PDF de exemplo conserva suas duas páginas, seis imagens extraídas (além da composição preservada nas prévias originais) e 17 blocos de texto. Os testes de voz do sistema usam simulação controlada; `test:voice` valida síntese neural real e reprodução no navegador, sem depender de uma voz instalada. O layout mobile foi verificado no Chromium, sem teste em hardware mobile.

Na versão 0.4, os testes também verificam autenticação com serviço controlado, políticas de aprovação/bloqueio, prazo de sessão, painel master, recuperação de senha e backup criptografado. As regras SQL/RLS passam em PostgreSQL real. Ainda não há projeto Supabase hospedado configurado: a ativação remota e o envio de e-mails permanecem pendentes.

## Estrutura

- `src/access.ts` / `src/admin.ts`: login, renovação de acesso e gestão master.
- `src/auth-storage.mjs`: sessões por aba e verificador PKCE temporário para links de e-mail.
- `src/backup-format.mjs` / `src/backup.ts`: arquivos locais criptografados e restauração.
- `supabase/`: migração de permissões/auditoria e função de controle de acesso.
- `src/main.ts`: interface, player, sincronização e gerenciamento de projetos.
- `src/processor.worker.ts`: extração, transcrição e tradução locais.
- `src/storage.ts`: biblioteca IndexedDB e remoção de modelos.
- `src/learning.ts`: projetos, subassuntos, biblioteca de PDFs e leitor de páginas.
- `src/pdf.ts`: extração local de textos/imagens e preservação das páginas originais com PDF.js.
- `src/narration.ts`: leitura contínua em português/inglês, pausa e busca manuais, sem pausas automáticas no vídeo.
- `src/narration-plan.mjs`: agrupamento de texto e seleção da pronúncia inglesa.
- `src/neural-voice.worker.ts`: geração local das vozes e montagem de uma faixa contínua, mantida só em memória.
- `src/online.ts` e `src/cloud-protocol.mjs`: seleção e revisão de textos, pedidos Gemini e validação de respostas.
- `src/appearance.ts` e `src/preferences.mjs`: preferências e contraste de cores.
- `src/subtitles.mjs`: importação/exportação e validação de tempos.
- `scripts/build-service-worker.mjs`: cache versionado pelo conteúdo do build e limitado ao escopo do app.
- `tests/`: testes unitários e funcionais em Chromium.

Os modelos e runtimes têm licenças próprias. FFmpeg core é distribuído sob GPL; consulte `THIRD_PARTY_NOTICES.md` antes de distribuir o build.

### Novidades da versão 0.5

- Tema escuro em toda a janela e lateral que acompanha a cor escolhida.
- Lista de projetos separada do acompanhamento; criação/exclusão do projeto na lista inicial.
- Mover páginas e vídeos entre projetos/subassuntos e escolher sua posição; exclusão individual dentro do projeto.
- Controles de organização, idioma e voz recolhidos para ampliar a área de leitura/player.
- Voz neural PT-BR Faber com Piper/ONNX no próprio dispositivo. Use **Preparar voz natural** no painel de opções; o primeiro uso baixa cerca de 64 MB. As vozes locais do sistema continuam disponíveis. Textos não são enviados para síntese de voz.
- Gemini permite verificar a chave/listar modelos de texto e recuperar um modelo indisponível (HTTP 404) usando o catálogo do provedor. A chave continua só na memória e cada envio de texto exige seleção e autorização.
- Cadastro simplificado com contato e painel master com convites, aprovação, remoção de acesso e registros comerciais manuais. Projetos e materiais continuam exclusivamente locais.

Para um Supabase já ativo, aplique **somente a segunda migração** e atualize a função conforme [as instruções de atualização](docs/SUPABASE_SETUP.md#atualizar-um-projeto-já-ativo). O app mantém compatibilidade com os controles anteriores até concluir esses passos.

Teste opcional da voz real, com o servidor de testes em execução: `npm run test:voice`. Usa texto público de teste, verifica síntese em português, inglês e uma faixa bilíngue contínua, controles reais de PDF/vídeo e um novo worker offline com modelos em cache. Não valida autorização do Supabase hospedado.

### Novidades da versão 0.6

- Biblioteca única com abas **Páginas** e **Vídeos**, leitura e reprodução locais, com navegação por teclado.
- Crie os materiais em **Páginas PDF** ou **Traduzir vídeo** e use **Veja a tradução: Na biblioteca / No projeto** para acompanhar o resultado.
- Novas senhas de conta, recuperação e backups aceitam no mínimo **8 caracteres**. Backups anteriores continuam compatíveis. No Supabase hospedado, configure também **Authentication → Providers → Email → Minimum password length** em **8**; o arquivo `supabase/config.toml` não altera esse painel automaticamente.

### Novidades da versão 0.7

- Narração contínua de vídeos e PDFs, com o áudio preparado em sequência para evitar esperas entre trechos.
- O vídeo segue em movimento; nenhuma palavra é cortada ao ultrapassar o tempo de uma legenda.
- Voz local em inglês para termos preservados, opção de leitura do original inglês e ajustes de pronúncia por material.
- Sem mudança no Supabase nem upload de conteúdo. Atualize ou reabra o PWA para carregar a versão nova.

### Novidades e correções da versão 0.8

- Seletores de projeto, voz e idioma permanecem estáveis durante atualizações da narração.
- Salvar a organização ou o andamento do projeto preserva o player e a reprodução atual.
- A preparação das vozes e da narração encerra seu status corretamente; cancelamentos e erros não deixam mensagens de geração presas na tela.

- Recuperação em `/recuperar-senha/`, confirmação em `/confirmar-email/` e nova senha em `/nova-senha/`; alteração pela área de Preferências. Requisitos de senha aparecem no cadastro. Cadastre as URLs no Supabase conforme [o guia de configuração](docs/SUPABASE_SETUP.md#3-configurar-e-mail-e-recuperação-de-senha).
- PT-BR é o idioma padrão da narração. A voz natural mantém o áudio preparado na memória e reposiciona a leitura ao avançar/voltar no vídeo, inclusive depois do fim. Vozes do sistema retomam a partir do trecho correspondente.
- Transcrição local reforçada com Whisper Base; Whisper Small é opcional para maior precisão, com mais tempo e memória. Mais contexto na sobreposição e preservação do texto quando os tempos estão ausentes/inválidos. Tempos recuperados a partir do texto são aproximados; reconhecimento ainda pode precisar de revisão.
- Para materiais anteriores, use **Refazer transcrição do áudio**. A tradução isolada reutiliza o texto existente. Confira o idioma original; mantenha o vídeo local selecionado.

### Organização da versão 0.8.1

Vídeos e páginas usam o mesmo painel: idioma, escolha da ação, explicação e um botão principal. Organização e voz ficam em um grupo separado; a análise com Gemini fica em **Mais opções**.

- **Transcrever:** gera apenas o texto original, para revisar antes de traduzir. Quando já há texto, permite refazer o reconhecimento com o vídeo local selecionado, após confirmar a substituição.
- **Transcrever e traduzir:** gera texto e PT-BR localmente em vídeos novos; quando a transcrição existe, traduz o texto atual.
- **Traduzir com Gemini:** usa somente o texto já disponível, selecionado e autorizado. Vídeo, áudio, PDF e imagens permanecem locais.
- **Alto padrão — Whisper Small** e **Médio — Whisper Base** identificam os modelos de reconhecimento; `.en` aparece para áudio em inglês. Médio continua sendo a escolha inicial; Alto padrão exige mais memória e tempo. O seletor aparece quando a ação reconhece áudio.

### Sincronia e diagnóstico da versão 0.8.2

- A voz natural de vídeo usa limites reais de áudio por trecho, ajusta a velocidade por trecho e mantém legenda e destaque ligados à fala. Avançar/voltar reutiliza a narração em memória, inclusive depois da conclusão, sem pausar o vídeo automaticamente. O posicionamento dentro de um trecho ainda é proporcional; traduções longas podem atrasar em relação à cena para preservar todas as palavras.
- Vincular novamente o arquivo local preserva a tela escolhida durante o carregamento, sem fechar a biblioteca ou interromper a narração iniciada pelo usuário.
- O Gemini informa causas de HTTP 403 quando o provedor fornece o motivo. Chamadas enviam apenas a origem pública como referência para permitir chaves restritas por site, sem expor URLs de recuperação. Veja [configuração, cota gratuita e diagnóstico](docs/GEMINI_SETUP.md).
- Foi realizada uma [avaliação da tradução local para cursos empresariais](docs/QUALITY_REVIEW.md), com 12 frases sintéticas e resultados reais. Ela encontrou alteração de números, perda de condições e termos inadequados. A tradução atual deve ser tratada como rascunho sujeito a revisão. O documento prioriza glossário, aprovação, avaliação representativa, OCR local e alinhamento por palavra.

### Recuperação de falhas do Gemini na versão 0.8.3

HTTP 503 indica indisponibilidade temporária da geração, mesmo que a consulta da chave e dos modelos tenha funcionado. O diálogo agora mostra o modelo em uso, permite escolher um modelo da lista já consultada e oferece **Tentar novamente** após HTTP 502/503/504. Os textos selecionados, a chave e a autorização permanecem no diálogo; cada novo envio depende de um clique, sem repetição ou troca automática de modelo para esses erros. Nada é salvo antes de revisar e aplicar a resposta.

### Narração contínua e senha na versão 0.8.4

- A narração não espera o início de cada legenda nem muda de velocidade entre trechos. O ritmo acompanha apenas a velocidade escolhida no player; o silêncio excedente nas emendas é removido, preservando a pontuação. O áudio preparado continua disponível para avançar/voltar e as legendas seguem a fala. A continuidade pode adiantar ou atrasar a voz em relação às cenas quando há grandes intervalos no original.
- Cadastro e nova senha mostram os cinco requisitos com OK em tempo real: pelo menos 8 caracteres, maiúscula, minúscula, número e símbolo. A configuração pública agora espelha a política forte apresentada no Supabase. O servidor continua responsável por validar todas as regras.
- Botão para mostrar/ocultar senha no login, cadastro, redefinição, confirmação e backup. O botão não envia o formulário; a senha volta a ficar oculta e é limpa ao liberar o acesso ou concluir o backup. Senhas de login existentes continuam aceitas e o backup mantém a política independente de mínimo de 8 caracteres.

### Configurar os e-mails do Supabase

Use o [guia de vinculação das páginas, URLs e templates](docs/AUTH_EMAIL_SETUP.md). Sem SMTP próprio, use os e-mails padrão com as URLs corretas e abra-os no mesmo navegador/perfil do pedido. O painel pode exigir SMTP próprio para liberar a edição dos templates. Com SMTP ativo, os modelos [Confirm signup](supabase/templates/confirm-signup.html) e [Reset password](supabase/templates/reset-password.html) apontam para as páginas publicadas e usam o token do Supabase, inclusive para abrir em outro navegador. Para começar com o provedor escolhido, veja [Resend sem domínio: teste e passagem para produção](docs/RESEND_SETUP.md). As configurações de SMTP e templates são aplicadas no painel Supabase; os arquivos do repositório não alteram o painel automaticamente.

### Tradução por frase na versão 0.8.5

- O modelo local traduz cada frase de uma legenda/bloco separadamente e reúne as traduções na mesma ordem. Isso corrige a omissão reproduzida de uma instrução inicial quando duas frases eram traduzidas juntas. Texto original, posição e tempos da legenda permanecem iguais; vídeos e PDFs usam o mesmo processamento.
- O tamanho dos blocos agora considera os tokens do modelo, com margem para o idioma e a geração, em vez de cortar a cada 80 palavras. Frases muito longas são subdivididas sem descartar o final. Respostas vazias interrompem a operação; saídas próximas ao limite de geração são descartadas e refeitas localmente em partes menores.
- Para atualizar um vídeo já traduzido, abra-o em **Traduzir vídeo**, escolha **Transcrever e traduzir · local** e execute **Traduzir transcrição em PT-BR**. Com transcrição existente, isso traduz novamente o texto atual; não precisa reconhecer o áudio outra vez. A operação substitui as traduções, incluindo edições manuais: exporte uma cópia antes se quiser preservá-las. Páginas usam a correção ao traduzir textos pendentes; traduções salvas não são alteradas automaticamente.
- A melhoria reduz esse tipo de omissão, mas não constitui conferência semântica nem garante termos, números ou condições corretos. Veja a [avaliação e seus limites](docs/QUALITY_REVIEW.md). Com o servidor de testes ativo após o build, `npm run test:translation` valida o worker real com instruções genéricas em vídeo/PDF e uma nova execução offline. O teste usa uma conta simulada, não envia e-mails nem conteúdo para serviços de tradução.

### Diagnóstico de links de acesso na versão 0.8.6

Recuperação e confirmação continuam aceitando os links dos e-mails padrão do Supabase, com PKCE e os redirecionamentos próprios. A tela agora diferencia endereço aberto sem sessão, verificador ausente no navegador/perfil, expiração/uso anterior informado pelo Auth e falha de serviço/conexão. Os motivos reaparecem após recarregar sem conservar tokens na URL. Um callback inválido continua impedindo a alteração de senha ou confirmação com uma sessão alheia já aberta. A documentação separa os passos com e sem SMTP; mudar os arquivos do app não libera a edição de templates nem altera o painel hospedado.

### Erros de cadastro e envio na versão 0.8.7

Cadastro, recuperação e reenvio de confirmação mostram a causa conhecida da recusa e uma referência segura, incluindo HTTP 429, cota de e-mails, destinatário não autorizado, cadastro desabilitado e senha recusada pelo servidor. Dados internos do provedor não aparecem no texto de erro. Os campos permanecem preenchidos para uma tentativa manual; o app não repete o pedido automaticamente. Veja [limites e envio para novos usuários](docs/AUTH_EMAIL_SETUP.md#6-cadastro-recusado-mesmo-com-os-campos-válidos). A correção das mensagens não altera cotas do Supabase ou do provedor; SMTP, domínio e limites precisam ser configurados no painel.
