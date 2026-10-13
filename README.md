# Entrelinhas

PWA para compreender vídeos e PDFs em outros idiomas, acompanhar projetos, preservar imagens e narrar em PT-BR. Inclui tradução local e tradução/análise opcional de texto com Gemini. O site é estático e pode ser publicado no GitHub Pages; arquivos e textos são processados no dispositivo.

## Desenvolvimento

Requisitos: Node.js 22.12+ (ou 24), npm e um navegador atual com WebAssembly, Web Workers e IndexedDB.

```sh
# O projeto usa ONNX no navegador. Não precisa dos binários CUDA para Node.
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm run dev
```

No PowerShell, defina `$env:ONNXRUNTIME_NODE_INSTALL_CUDA="skip"` antes de `npm ci`. O uso local não precisa de chave ou backend. O Gemini é opcional e usa uma chave pessoal informada na interface, somente na memória da sessão.

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
4. Exporte SRT, VTT, texto ou projeto JSON. O JSON inclui os textos e tempos dos dois idiomas, sem incluir o vídeo. Uma legenda SRT/VTT no idioma original pode ser importada para tradução, evitando a etapa de transcrição.
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

## Narração em PT-BR

No vídeo, ative **Narrar em PT-BR** depois de gerar as traduções. O áudio original é silenciado automaticamente; o controle **Silenciar áudio original** também pode ser usado separadamente. A narração acompanha os trechos traduzidos, pausa com o player e se reposiciona após mudanças de tempo. Quando uma fala demora mais que seu trecho, o vídeo aguarda a leitura e depois retoma, para evitar cortar palavras. Ao desligar a narração, o estado de áudio anterior é restaurado, salvo se você alterou manualmente o controle de silenciamento.

Nas páginas PDF, **Ler em PT-BR** lê os trechos traduzidos e destaca o parágrafo atual. Também é possível ler um trecho individual, pausar, continuar e parar. Os controles de voz e velocidade se aplicam à leitura.

São aceitas somente vozes que o navegador informa como **locais** e com idioma **pt-BR**. Vozes remotas são excluídas para evitar enviar os textos internos a serviços de fala. Se não aparecer uma voz, instale Português (Brasil) nas configurações de fala/idiomas do sistema e reabra o navegador. A disponibilidade varia conforme sistema e navegador; o app não usa uma voz online como substituta automática.

## Privacidade e armazenamento

- O app não tem servidor de upload ou analytics. A chave pessoal do Gemini, se informada, existe somente na memória da sessão. Os vídeos são reproduzidos com URLs `blob:`. Vídeo e áudio não são enviados para serviços de IA.
- A interface e os runtimes são servidos pelo Pages. Os modelos de `Xenova/whisper-tiny.en`, `Xenova/whisper-tiny`, `Xenova/opus-mt-en-ROMANCE` e `Xenova/m2m100_418M` são baixados do Hugging Face via HTTPS. Esses downloads são requisições GET sem o conteúdo do vídeo. O provedor de download pode observar os metadados usuais de conexão, como IP e modelo solicitado.
- As transcrições, traduções, projetos, subassuntos e imagens das páginas PDF são salvos no IndexedDB deste navegador. O vídeo fica apenas na sessão por padrão; a cópia persistente exige ativar a opção na tela. A atualização do banco preserva os vídeos e legendas criados antes da versão 0.2.
- O app não criptografa a biblioteca. Use um perfil confiável, principalmente para conteúdo interno. Sites no mesmo domínio/origem compartilham os limites de segurança de armazenamento do navegador; tenha cuidado com outros projetos publicados no mesmo domínio do Pages.
- Não há sincronização entre celulares e computadores. O navegador pode remover dados por pressão de armazenamento; modo privado, reinstalação e limpeza do site podem apagar a biblioteca. Mantenha os arquivos originais e backups JSON em locais adequados para dados internos.
- Em **Privacidade**, é possível excluir a biblioteca e os modelos em cache. Excluir um projeto remove somente a cópia do app; não altera o arquivo original.
- Vídeos internos, arquivos de transcrição e projetos exportados não devem ser adicionados ao repositório. O vídeo enviado na conversa não faz parte do código ou dos assets públicos.

## PWA e modo offline

Abra por HTTPS (ou localhost durante desenvolvimento). Chrome e Edge oferecem instalação no desktop/Android; no iOS, use Safari → Compartilhar → Adicionar à Tela de Início. A disponibilidade do comando de instalação depende do navegador.

O service worker guarda a interface e os runtimes da versão atual; não intercepta vídeos `blob:` nem uploads. Os modelos completos ficam no cache do Transformers.js. Termine um processamento online e teste sem conexão antes de depender da IA offline. O cache da interface não garante que os modelos tenham terminado de baixar.

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

Esse teste exige acesso aos modelos, espaço e memória. Verifica a extração, transcrição, tradução, tempos válidos e textos distintos nos dois idiomas, sem imprimir o conteúdo privado. Em seguida desativa a conexão e processa o vídeo inteiro novamente com os modelos em cache. No runner de nuvem, usa `curl` para transportar somente os downloads GET pelo proxy HTTPS configurado, mantendo a verificação TLS; a extração e a inferência executam nos workers WebAssembly reais do Chromium. Em um navegador do usuário, o aplicativo baixa os modelos diretamente, sem essa adaptação de testes.

Na versão 0.3, build, 11 testes unitários e 12 testes funcionais validam organização em lateral, navegação entre vídeo/PDF, retomada, progresso, notas, tema/cor, persistência e privacidade dos pedidos online. A integração Gemini é testada com respostas controladas e uma chave fictícia; nenhuma chamada real com chave pessoal foi feita neste ambiente. A qualidade e disponibilidade do serviço devem ser conferidas usando a chave no aplicativo.

O vídeo de exemplo foi revalidado com FFmpeg, Whisper e Marian reais no Chromium, produzindo cinco trechos traduzidos, seguido de processamento completo offline com os modelos em cache. Uma tradução sintética de espanhol para português também passou com M2M100 real; no runner, os pesos grandes foram transportados por um servidor local de testes para contornar o limite de tamanho do canal DevTools, sem alterar o aplicativo publicado. O PDF de exemplo conserva suas duas páginas, seis imagens extraídas (além da composição preservada nas prévias originais) e 17 blocos de texto. Os testes de voz usam simulação controlada; a reprodução audível depende de uma voz local PT-BR instalada. O layout mobile foi verificado no Chromium, sem teste em hardware mobile.

## Estrutura

- `src/main.ts`: interface, player, sincronização e gerenciamento de projetos.
- `src/processor.worker.ts`: extração, transcrição e tradução locais.
- `src/storage.ts`: biblioteca IndexedDB e remoção de modelos.
- `src/learning.ts`: projetos, subassuntos, biblioteca de PDFs e leitor de páginas.
- `src/pdf.ts`: extração local de textos/imagens e preservação das páginas originais com PDF.js.
- `src/narration.ts`: leitura em PT-BR usando somente vozes locais e sincronização com o vídeo.
- `src/online.ts` e `src/cloud-protocol.mjs`: seleção e revisão de textos, pedidos Gemini e validação de respostas.
- `src/appearance.ts` e `src/preferences.mjs`: preferências e contraste de cores.
- `src/subtitles.mjs`: importação/exportação e validação de tempos.
- `scripts/build-service-worker.mjs`: cache versionado pelo conteúdo do build e limitado ao escopo do app.
- `tests/`: testes unitários e funcionais em Chromium.

Os modelos e runtimes têm licenças próprias. FFmpeg core é distribuído sob GPL; consulte `THIRD_PARTY_NOTICES.md` antes de distribuir o build.
