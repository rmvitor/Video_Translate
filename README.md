# Entrelinhas

PWA para assistir a treinamentos em inglês com transcrição e tradução para português sincronizadas. O site é estático e pode ser publicado no GitHub Pages; vídeo, áudio e textos são processados no dispositivo.

## Desenvolvimento

Requisitos: Node.js 22.12+ (ou 24), npm e um navegador atual com WebAssembly, Web Workers e IndexedDB.

```sh
# O projeto usa ONNX no navegador. Não precisa dos binários CUDA para Node.
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm run dev
```

No PowerShell, defina `$env:ONNXRUNTIME_NODE_INSTALL_CUDA="skip"` antes de `npm ci`. Não são necessárias chaves de API ou backend.

```sh
npm test
npm run build
npm run preview
```

`prepare:assets` copia os runtimes verificados dos pacotes npm para `public/runtime/`, uma pasta gerada e ignorada pelo Git. A configuração `base: './'` e o service worker usam caminhos relativos para funcionar em `/Video_Translate/` e em um domínio próprio. O build contém os runtimes WebAssembly e tem dezenas de MB; os modelos são baixados separadamente.

## Usar a ferramenta

1. Adicione um vídeo (até 500 MB e 30 minutos). MP4 com H.264/AAC oferece maior compatibilidade entre navegadores. Outros formatos dependem do suporte do navegador para reprodução.
2. Clique em **Transcrever e traduzir**. FFmpeg WASM extrai áudio mono a 16 kHz em um worker. Whisper transcreve o inglês com tempos; Marian traduz cada trecho para português. Os modelos quantizados executam na CPU via WebAssembly, sem exigir WebGPU ou cabeçalhos de isolamento incompatíveis com o Pages.
3. Assista com legendas em português, inglês ou nos dois idiomas. A transcrição destaca o trecho atual; clique em um trecho para navegar no vídeo. Busque ou edite textos e tempos para corrigir nomes e termos da empresa.
4. Exporte SRT, VTT, texto ou projeto JSON. O JSON inclui os textos e tempos dos dois idiomas, sem incluir o vídeo. Uma legenda SRT/VTT em inglês pode ser importada para tradução, evitando a etapa de transcrição.
5. Abra a **Minha biblioteca** para retomar um projeto. Sem uma cópia local, selecione novamente o vídeo original. Ative **Guardar vídeo neste dispositivo** para manter uma cópia no IndexedDB e assistir depois sem selecionar o arquivo novamente.

A tradução automática pode conter erros e o modelo multilíngue pode produzir termos de português europeu. A ferramenta prefere o token de português brasileiro quando presente no vocabulário do modelo, e permite revisão manual para adequar o texto a PT-BR. Não considere a transcrição uma reprodução exata do treinamento sem revisão, especialmente em termos técnicos.

## Privacidade e armazenamento

- O app não tem servidor de upload, analytics ou credenciais. Os vídeos são reproduzidos com URLs `blob:`. Vídeo e áudio não são enviados para serviços de IA.
- A interface e os runtimes são servidos pelo Pages. Os modelos de `Xenova/whisper-tiny.en` e `Xenova/opus-mt-en-ROMANCE` são baixados do Hugging Face via HTTPS. Esses downloads são requisições GET sem o conteúdo do vídeo. O provedor de download pode observar os metadados usuais de conexão, como IP e modelo solicitado.
- As transcrições e traduções são salvas no IndexedDB deste navegador, inclusive se a tradução falhar depois da transcrição. O vídeo fica apenas na sessão por padrão; a cópia persistente exige ativar a opção na tela.
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

## Testes de navegador

Os testes usam um servidor estático com o prefixo `/Video_Translate/`, reproduzindo o caminho do Pages. Eles verificam reprodução local, importação, edição, sincronização, exportação, persistência, exclusão, layout mobile, escape de textos e o shell offline. Também exercitam a extração real de áudio com FFmpeg WASM.

```sh
# Linux com Chromium e FFmpeg instalados:
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Em outra instalação, use `npx playwright install chromium` e informe o caminho do executável em `CHROMIUM_PATH`. O teste de falha de download bloqueia explicitamente o destino dos modelos: ele verifica extração de áudio e tratamento do erro, e não demonstra inferência bem-sucedida. O teste gera um vídeo sintético em uma pasta temporária. `EXAMPLE_VIDEO=/caminho/privado/video.mp4` permite exercitar a extração com outro arquivo sem copiá-lo para o repositório.

### Inferência real e validação nesta entrega

Com o servidor de testes rodando (`node scripts/test-server.mjs`), é possível validar os modelos completos com um arquivo local:

```sh
VIDEO_INPUT=/caminho/privado/video.mp4 npm run test:ai
```

Esse teste exige acesso aos modelos, espaço e memória. Verifica a extração, transcrição, tradução, tempos válidos e textos distintos nos dois idiomas, sem imprimir o conteúdo privado. Em seguida desativa a conexão e processa o vídeo inteiro novamente com os modelos em cache. No runner de nuvem, usa `curl` para transportar somente os downloads GET pelo proxy HTTPS configurado, mantendo a verificação TLS; a extração e a inferência executam nos workers WebAssembly reais do Chromium. Em um navegador do usuário, o aplicativo baixa os modelos diretamente, sem essa adaptação de testes.

O build, seis testes unitários e quatro testes funcionais em Chromium passaram. O vídeo de exemplo enviado (30,8 segundos) foi processado por FFmpeg, Whisper e Marian no navegador, produzindo cinco trechos traduzidos com tempos e uma faixa de legendas. O processamento completo também passou com a internet desativada e sem adaptação de transporte, usando o cache real do navegador. A interface foi verificada em viewport mobile, sem cortes no player ou rolagem horizontal; não houve teste em hardware mobile ou publicação remota.

O proxy inicialmente bloqueou o Hugging Face e passou a permitir os downloads após a configuração de rede. Os destinos necessários estão registrados no rascunho do ambiente (`huggingface.co`, `*.hf.co`, `*.xethub.hf.co`).

## Estrutura

- `src/main.ts`: interface, player, sincronização e gerenciamento de projetos.
- `src/processor.worker.ts`: extração, transcrição e tradução locais.
- `src/storage.ts`: biblioteca IndexedDB e remoção de modelos.
- `src/subtitles.mjs`: importação/exportação e validação de tempos.
- `scripts/build-service-worker.mjs`: cache versionado pelo conteúdo do build e limitado ao escopo do app.
- `tests/`: testes unitários e funcionais em Chromium.

Os modelos e runtimes têm licenças próprias. FFmpeg core é distribuído sob GPL; consulte `THIRD_PARTY_NOTICES.md` antes de distribuir o build.
