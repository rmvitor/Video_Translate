# Gemini: configuração e HTTP 403

1. Abra [Google AI Studio](https://aistudio.google.com/apikey) e crie uma chave de **API** no projeto que você pretende utilizar. Uma assinatura do aplicativo Gemini e o faturamento da API são produtos distintos.
2. No Entrelinhas, abra **Preferências**, informe a chave e use **Verificar chave e modelos**. A chave permanece em memória nesta sessão; não é incluída em projetos ou backups. A consulta lista modelos de texto sem enviar material de treinamento.
3. Escolha um modelo disponível. Consultar a lista não garante autorização/cota para gerar uma resposta.
4. Em vídeos, use **Transcrever** primeiro. Depois escolha **Traduzir com Gemini**. Em PDFs com texto selecionável, escolha diretamente essa opção. Marque os trechos, autorize o envio, revise a tradução retornada e só então aplique.

## É necessário pagar?

Alguns modelos/projetos elegíveis oferecem cota gratuita; disponibilidade, limites e região variam. Outros modelos exigem faturamento. **HTTP 403 sozinho não demonstra falta de pagamento:** indica recusa de acesso. Confira [preços e cotas atuais](https://ai.google.dev/gemini-api/docs/pricing) no projeto antes de habilitar cobrança. O app não ativa faturamento nem altera o plano.

## Diagnóstico

| Resposta | O que conferir |
| --- | --- |
| 403 / `API_KEY_HTTP_REFERRER_BLOCKED` | Restrições de sites da chave. Para esta instalação, permita `https://rmvitor.github.io/*`. As chamadas enviam como Referer somente `https://rmvitor.github.io/`, sem caminho, query ou fragmento. Uma restrição exclusiva a `/Video_Translate/*` pode não corresponder a essa origem. |
| 403 / `API_KEY_SERVICE_BLOCKED` | Nas restrições de API da chave, permitir **Generative Language API** (`generativelanguage.googleapis.com`). |
| 403 / `SERVICE_DISABLED` | Ativar essa API no mesmo projeto ao qual a chave pertence. |
| 403 / `API_KEY_IP_ADDRESS_BLOCKED` | Uma chave restrita a IP de servidor não corresponde ao uso direto no navegador. Configurar uma chave apropriada com restrição de sites e da API. |
| 403 / motivo de faturamento informado pelo Google | Verificar o plano, o modelo e a elegibilidade gratuita desse projeto. O app só mostra esse diagnóstico quando o provedor fornece o motivo estruturado. |
| 403 sem motivo conhecido | Revisar projeto, permissões, restrições e disponibilidade do modelo no AI Studio/Google Cloud. Não atribuir automaticamente a cobrança. |
| 404 | Verificar modelos nas Preferências e escolher um disponível. No modo automático, o app pode consultar o catálogo e repetir com outro modelo de texto. |
| 429 | Cota esgotada ou limite de requisições. Conferir os limites do modelo e aguardar; não há repetição automática para esse erro. |
| 503 | Serviço temporariamente indisponível ou sobrecarregado. Aguardar e usar **Tentar novamente**, ou escolher outro modelo disponível no próprio diálogo. Consultar a lista de modelos pode funcionar mesmo quando a geração está indisponível. Não indica, por si só, falta de pagamento. |
| 502/504 | Falha temporária de comunicação. Aguardar e repetir manualmente. |
| 400/401 | Conferir a chave e a solicitação no AI Studio. |

O app interpreta códigos estruturados do Google, sem reproduzir mensagens arbitrárias que possam conter chave ou texto confidencial. Erros não substituem a tradução salva. Manter a referência de origem nas chamadas da API resolve a incompatibilidade do app com chaves restritas por site; não concede uma permissão ausente no projeto do Google.

Em falhas temporárias, a seleção de textos, a chave e o consentimento permanecem no diálogo. O modelo em uso é mostrado antes de enviar. O aplicativo não repete chamadas nem troca de modelo automaticamente em resposta a HTTP 503; cada nova tentativa exige um clique do usuário. A escolha de outro modelo usa a lista consultada com a mesma chave e é compartilhada com as Preferências. Verifique a cota e os custos do modelo no seu projeto.

## Conteúdo empresarial

Mesmo mantendo vídeos, áudio, PDFs e imagens locais, **os textos autorizados saem do dispositivo**. Conferir a política da empresa e os [termos de uso de dados](https://ai.google.dev/gemini-api/terms) do serviço escolhido. As condições de uso de dados podem diferir entre modalidades gratuitas e pagas; pagamento não deve ser interpretado como promessa de ausência de retenção. Não foi realizado teste com a chave real do usuário, pois ela não está disponível neste ambiente e não deve ser enviada pelo chat.

Os preços e limites específicos não foram verificados nesta revisão: o ambiente não conseguiu acessar diretamente as páginas do Google. Os links acima são as referências para conferir a oferta atual, sem presumir uma cota específica.
