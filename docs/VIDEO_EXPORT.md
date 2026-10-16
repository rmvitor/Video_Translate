# Baixar o vídeo traduzido

A versão 0.9.0 monta um MP4 no próprio navegador, sem enviar o vídeo, o áudio ou os textos para um serviço de exportação. O mesmo botão **Baixar vídeo** aparece ao abrir o material em Traduzir vídeo, Minha biblioteca ou Projetos e assuntos. Também está disponível no diálogo de exportação dos textos.

1. Abra o vídeo com a transcrição traduzida. Se a biblioteca guarda somente os textos, use **Localizar vídeo original** no diálogo e selecione o arquivo correspondente.
2. Clique em **Baixar vídeo** e escolha áudio e legenda.
3. Clique em **Preparar MP4**, mantenha o app aberto e aguarde a preparação local.
4. Quando aparecer **Vídeo pronto**, clique em **Baixar MP4** e escolha onde salvar. No celular, a localização depende do navegador e do sistema.

## Opções do arquivo

| Opção | Resultado |
| --- | --- |
| Narração em PT-BR | Usa a voz Natural local em português do Brasil como áudio do arquivo, em ritmo natural de 1×. A escolha de voz/velocidade do player não altera essa faixa. |
| PT-BR + áudio original | Duas faixas separadas: PT-BR como principal e áudio original como alternativa. O vídeo precisa conter uma faixa original. A seleção depende do player; VLC é um exemplo compatível. |
| Áudio original | Mantém o conteúdo do áudio original, convertido para AAC. Permite baixar o vídeo somente com legenda traduzida. |
| Legenda fixa na imagem | A legenda fica visível em qualquer player, sem precisar ativar uma faixa. Ela não pode ser desligada e exige recodificar as imagens, o que leva mais tempo. |
| Faixa selecionável | Inclui legenda PT-BR no MP4, para ligar/desligar em um player compatível. Com duas faixas de áudio, inclui duas opções de legenda: uma no ritmo da narração, outra no ritmo do áudio original. |
| Sem legenda | Gera o MP4 apenas com as faixas de áudio escolhidas. |

Os padrões são **Narração em PT-BR** e **Legenda fixa na imagem**. Todos os trechos precisam estar traduzidos para gerar áudio ou legenda em PT-BR. A exportação não altera a transcrição, os tempos ou o vídeo guardados na biblioteca. SRT, VTT, TXT, projeto JSON e backup local continuam disponíveis separadamente.

## Narração e tempos

A exportação reutiliza a narração natural já preparada no player quando o texto e o modo PT-BR correspondem. Caso contrário, sintetiza a voz localmente. Vozes de leitura do sistema não são gravadas; o arquivo usa a voz Natural local. Os modelos públicos podem precisar ser baixados no primeiro uso. Depois do cache completo, a montagem e a voz podem funcionar offline; o controle de acesso do aplicativo continua exigindo a autorização prevista no sistema.

A fala é contínua, com uma espera inicial equivalente ao início do primeiro trecho. As legendas do arquivo narrado seguem os limites reais do áudio gerado. Não há alinhamento por palavra nem tradução dublada com duração idêntica à fala original: a voz pode adiantar ou atrasar em relação às cenas. Se ela ultrapassar o fim do vídeo, o MP4 mantém a última imagem até concluir a narração, preservando o texto inteiro. As cenas durante o vídeo não são pausadas para esperar cada trecho.

## Limites e cancelamento

- Até **500 MB e 30 minutos de vídeo de origem**. Esse limite não garante memória suficiente em todo dispositivo; arquivos grandes ou resolução alta podem falhar em celulares. A recodificação de legendas fixas ou de outros codecs é mais custosa.
- Quando possível, o vídeo H.264 com legenda selecionável é copiado sem recodificar a imagem. Outros casos usam H.264, e o áudio usa AAC para compatibilidade com MP4.
- **Cancelar exportação**, fechar o diálogo ou perder a autorização encerra o processamento. Um resultado atrasado não é apresentado à conta seguinte. A operação preserva os materiais originais.
- O download é um arquivo comum do dispositivo. Ele não é enviado para o Supabase, incluído automaticamente no backup nem adicionado à biblioteca. Guarde-o segundo as regras da empresa.

## Validação de desenvolvimento

`npm test` cobre tempos, retenção da fala, validação de opções e planejamento das faixas. Após `npm run build`, `npx playwright test tests/browser/video-export.spec.ts` usa vídeos e áudio sintéticos e o FFmpeg/WASM real, verificando os MP4 com ffprobe/FFmpeg nativos. A suíte cobre faixas, legenda realmente desenhada na imagem, reutilização da voz, conversão de WebM, cancelamento e bloqueio da conta; o Auth é simulado.

Com o servidor `node scripts/test-server.mjs` ativo, `npm run test:video-export` exercita a voz Piper real e o FFmpeg/WASM em um vídeo sintético, incluindo uma exportação nova offline com duas faixas de áudio e duas de legenda. Precisa de Chromium e FFmpeg/ffprobe nativos para inspecionar o resultado; `AI_TEST_PROFILE` pode reutilizar um perfil exclusivo de testes com os modelos em cache. O teste não usa contas reais ou vídeos internos e só baixa recursos públicos.
