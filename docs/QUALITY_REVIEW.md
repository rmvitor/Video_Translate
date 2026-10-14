# Tradução local para treinamentos corporativos

Avaliação em 14/10/2026, usando o worker de produção no Chromium, WASM e `Xenova/opus-mt-en-ROMANCE` quantizado em q8. Foram traduzidas 12 frases sintéticas públicas de instruções financeiras, acesso e navegação. Não houve envio de conteúdo a serviços online; os modelos já estavam no cache (zero downloads nesta execução).

**Conclusão:** o motor atual serve como apoio à compreensão e como rascunho. Não é suficiente, sozinho, para disponibilizar um curso empresarial como tradução oficial. Encontramos alteração de números e perda de uma condição operacional, além de terminologia inadequada. Revisão por alguém que conheça o processo e os dois idiomas é necessária para materiais publicados.

## Evidência reproduzível

Depois de `npm run build`, com o servidor `node scripts/test-server.mjs` ativo, execute `node scripts/review-local-translation.mjs`. O script contém apenas estas frases sintéticas e imprime os resultados reais; ele não lê a biblioteca de um usuário real. O primeiro uso baixa os modelos públicos. `AI_TEST_PROFILE` pode apontar para um perfil **exclusivo de testes** com esses modelos em cache.

| Original | Saída real do motor local | Revisão |
| --- | --- | --- |
| Do not post entries until the reconciliation is approved. | Não envie entradas até a reconciliação ser aprovada. | Preserva a condição, mas “post entries” requer terminologia contábil, como “contabilizar lançamentos”. |
| Close Management is the name of the menu. Keep this interface label unchanged. | Fechar a gestão é o nome do menu. Mantenha este rótulo da interface inalterado. | Traduz o nome do menu apesar de o texto pedir sua preservação. |
| Click Home Management, then select Insight. | Clique em Gerenciamento de Casas, então selecione Insight. | O usuário não encontra esse rótulo na interface em inglês; preservar “Home Management”. |
| The balance is $1,250.50, not $1,520.50. | O saldo é de $1,250, e não de $1,52.50. | **Falha crítica:** os dois valores foram alterados. A localização de separadores deve manter os valores 1250,50 e 1520,50. |
| The administrator can approve tasks; the preparer cannot. | O administrador pode aprovar tarefas; o preparador não pode. | Preserva a diferença de permissões nesta frase. |
| Never share your password or multi-factor authentication code. | Nunca comparta sua senha ou código de autenticação multifator. | Sentido preservado; “compartilhe” é mais natural em PT-BR. |
| If the due date falls on a weekend, move it to the next business day. | Se a data de vencimento cai num fim de semana, mude-a para o dia seguinte. | **Falha crítica:** omite “útil”, podendo orientar uma data incorreta. |
| The account is locked, but the period is still open. | A conta está bloqueada, mas o período ainda está aberto. | Sentido preservado nesta frase. |
| Carry forward the opening balance without duplicating the journal entries. | Prosseguir o saldo de abertura sem duplicar as entradas do jornal. | “Journal entries” virou “entradas do jornal”; revisar para lançamentos contábeis. |
| Perform a three-way match between the purchase order, goods receipt, and invoice. | Faça uma combinação tripartida entre a ordem de compra, o recibo de mercadorias e a factura. | Revisar para conferência/conciliação entre pedido, recebimento e fatura conforme o sistema; variante regional inadequada. |
| An aging report lists outstanding items by the number of days overdue. | Um relatório envelhecido lista itens pendentes pelo número de dias atrasados. | “Aging report” exige termo do domínio, por exemplo relatório de vencimentos/aging. |
| Access is read-only unless the administrator grants edit permission. | O acesso é apenas leitura a menos que o administrador concede permissão de editar. | Regra preservada nesta frase; revisar gramática. |

A amostra é pequena e selecionada para revelar riscos. Ela não mede a frequência desses erros em todos os cursos, não é certificação de qualidade e não permite extrapolar uma porcentagem de precisão. A avaliação não cobre outros idiomas, todos os tipos de PDF ou reconhecimento de fala: as entradas já eram textos corretos.

## Limitações observadas na arquitetura

- Inglês usa Marian/OPUS en-ROMANCE; outros idiomas usam `Xenova/m2m100_418M`. O destino seleciona o primeiro token português disponível, sem garantia de vocabulário exclusivamente brasileiro.
- Cada legenda/bloco é traduzido separadamente, dividido em até 80 palavras por chamada, com até 256 novos tokens. Não há contexto do curso, glossário do projeto ou conferência semântica de omissões, números e condições.
- Melhorar Whisper Base/Small melhora o texto de entrada, mas não corrige erros próprios da tradução. Rever nomes técnicos na transcrição antes de traduzir continua necessário.
- Os termos em inglês configurados na narração controlam **pronúncia**; não constituem um glossário para o tradutor.
- PDF escaneado e texto embutido em imagens ainda não têm OCR. Uma página pode preservar a imagem sem traduzir seu texto.

## Melhorias recomendadas, em ordem

| Prioridade | Ferramenta ou recurso | Benefício e condição |
| --- | --- | --- |
| 1 | Glossário local por projeto + revisão e aprovação de tradução | Preservar nomes oficiais da interface e padronizar termos do domínio. Separar rascunho de material revisado; confrontar valores, datas, negações e instruções com o original. Um glossário sozinho não resolve perda de sentido. |
| 2 | Conjunto representativo de avaliação | Testar cursos reais **localmente**, com legendas e traduções de referência aprovadas. Medir palavras omitidas/transcrição e revisar erros críticos de tradução; separar qualidade de áudio, transcrição e tradução. Não usar apenas fluência ou uma pontuação automática. |
| 3 | Legendas SRT/VTT oficiais e alinhamento local com WhisperX | Priorizar legendas fornecidas pela empresa (a importação já existe). Um auxiliar desktop com WhisperX pode oferecer tempos por palavra para busca e retorno mais exatos; avaliar hardware e modelos antes de integrar. |
| 4 | Tesseract.js local | OCR de PDFs escaneados e rótulos das imagens, com revisão de números. Não requer enviar imagens à nuvem. |
| 5 | Auxiliar desktop com Ollama e modelo adequado à tradução | Avaliar Qwen/Gemma ou outro modelo com contexto e glossário, comparando-o ao conjunto de referência. Exige instalação, memória e integração segura com o PWA; não presumir que um modelo maior será sempre melhor. |
| 6 | Revisão opcional de texto com Gemini | Permite contexto entre os trechos selecionados; revisar a resposta e conferir condições comerciais/de uso de dados do plano e política da empresa. O app continua enviando apenas texto autorizado, nunca mídia. |

## Narração e sincronia

A voz natural de vídeo agora sintetiza cada trecho separadamente e junta os resultados em um único WAV local. O início de cada trecho corresponde à posição real de seus samples; o retorno reutiliza o áudio preparado. A velocidade é ajustada por trecho e as legendas/destaques acompanham o trecho efetivamente narrado. O vídeo não é pausado automaticamente.

O posicionamento **dentro** de um trecho ainda é proporcional, sem alinhamento por palavra. A velocidade tem limite de 0,6× a 2× para preservar inteligibilidade. Se uma tradução longa não couber no intervalo do original, a fala pode atrasar em relação à cena; a legenda acompanha a fala e o texto não é cortado. A voz pode aguardar o início do próximo trecho quando terminar cedo. Isso é diferente de pausar o vídeo. Alinhamento por palavra e edição dos tempos/textos são os próximos passos para sincronia mais precisa.
