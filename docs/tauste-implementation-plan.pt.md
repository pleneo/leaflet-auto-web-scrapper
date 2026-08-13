# Plano De Implementacao: Tauste Supermercados

Este documento descreve a implementacao completa da extracao de encartes do Tauste Supermercados. Ele existe para permitir retomada segura caso o desenvolvimento seja interrompido, falhe em algum ponto do stack, ou precise ser continuado por outro agente.

## Objetivo

Implementar uma estrategia hibrida para o Tauste Supermercados, preservando os dois objetivos do projeto:

- extracao de negocio: encontrar e baixar os PDFs completos dos encartes publicados pelo Tauste;
- dataset visual: quando Playwright for usado, capturar screenshot full-page, bounding box, estado FSM e label semantico antes de cada acao relevante.

A ordem de tentativa deve ser:

```text
API Flipsnack
  -> resolucao API/HTML do PDF da publicacao
    -> fallback Playwright direto no perfil Flipsnack
      -> fallback Playwright desde o site institucional Tauste
```

A camada API pode usar endpoints e HTML do Flipsnack para descobrir publicacoes e, se possivel, resolver o PDF sem browser. A camada Playwright direta deve partir do perfil publico do Tauste no Flipsnack. A camada Playwright desde o institucional deve provar que ainda e possivel navegar como um usuario humano desde a pagina inicial do Tauste ate os mesmos encartes.

## Fontes Observadas

O ponto de entrada estavel para navegacao visual e:

```text
https://institucional.tauste.com.br/
```

Na pagina inicial, ha pelo menos dois caminhos visuais para ofertas:

```text
Hero / inicio da pagina:
  texto: Veja nossas ofertas
  destino esperado: https://institucional.tauste.com.br/ofertas

Footer:
  coluna: Institucional
  link: Ofertas
  destino esperado: https://institucional.tauste.com.br/ofertas
```

O ponto intermediario de ofertas do site institucional e:

```text
https://institucional.tauste.com.br/ofertas
```

Esse endpoint redireciona ou entrega a experiencia publica do Flipsnack:

```text
https://www.flipsnack.com/taustesupermercado/
```

O endpoint Flipsnack observado para descoberta de publicacoes e:

```text
https://api.flipsnack.com/v2/publications/related?p=1&accountId=9D99E5AF8D6&excludeId=0&userUrl=https://www.flipsnack.com/taustesupermercado/&folderHash=&searchAfter=0&searchKey=
```

Constantes iniciais recomendadas:

```text
TAUSTE_INSTITUTIONAL_HOME_URL=https://institucional.tauste.com.br/
TAUSTE_INSTITUTIONAL_OFFERS_URL=https://institucional.tauste.com.br/ofertas
TAUSTE_FLIPSNACK_PROFILE_URL=https://www.flipsnack.com/taustesupermercado/
TAUSTE_FLIPSNACK_API_BASE_URL=https://api.flipsnack.com/v2
TAUSTE_FLIPSNACK_ACCOUNT_ID=9D99E5AF8D6
```

## Avaliacao Da API Flipsnack

O endpoint `publications/related` faz sentido como primeira camada da estrategia hibrida, mas nao deve ser tratado como extracao completa sozinho.

Ele fornece:

- `coverImgSrc`: URL da capa ou primeira imagem da publicacao;
- `hidePublishDate`: flag visual/comportamental do Flipsnack;
- `datePublished`: data e hora de publicacao;
- `name`: titulo da publicacao;
- `directLink`: slug relativo da publicacao no perfil Flipsnack.

Ele permite montar a pagina final:

```text
https://www.flipsnack.com/taustesupermercado/{directLink}
```

Exemplo:

```text
directLink=ofertas-tauste-bauru-zufbi5p7t9.html
publicationUrl=https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru-zufbi5p7t9.html
```

Limites conhecidos:

- o endpoint observado retorna capas e metadados de publicacao;
- ele nao retornou, ate agora, a URL direta do PDF;
- ele nao prova que o botao de download esta disponivel;
- ele pode listar publicacoes antigas ou materiais permanentes que nao sao encartes promocionais atuais;
- ele depende de parametros Flipsnack que podem mudar (`accountId`, `userUrl`, paginacao, `searchAfter`).

Conclusao:

```text
Usar a API para descoberta de publicacoes.
Tentar resolver o PDF por API/HTML em uma segunda etapa.
Considerar sucesso da API somente quando houver PDF final baixavel.
Caso a API descubra publicacoes mas nao resolva PDF, cair para Playwright.
```

## Fluxo Funcional Esperado

### Fluxo API Flipsnack

1. Fazer fetch do endpoint `publications/related`.
2. Validar que a resposta e uma lista de publicacoes tipadas.
3. Filtrar publicacoes relevantes:
   - preferir nomes que comecem com `Ofertas Tauste`;
   - manter excecoes deliberadas para campanhas especiais se forem encartes reais;
   - ignorar materiais permanentes antigos, como confeitaria/catalogos, salvo se o escopo decidir inclui-los.
4. Gerar `publicationId` deterministico a partir de `directLink` ou do hash final do slug.
5. Montar `publicationUrl`.
6. Fazer fetch da pagina individual da publicacao.
7. Extrair metadados Flipsnack disponiveis no HTML:
   - `accountId`;
   - `flipbookHash`;
   - iframe `player.flipsnack.com`;
   - `og:title`;
   - `og:image`;
   - JSON-LD `DigitalDocument`, quando presente.
8. Tentar resolver a URL direta do PDF por endpoints internos ou HTML do player.
9. Se a URL do PDF for resolvida:
   - baixar PDF via `LocalSharedPdfLeafletStorage`;
   - retornar sucesso API.
10. Se a URL do PDF nao for resolvida:

- retornar falha tipada de resolucao de PDF;
- permitir fallback Playwright.

Este fluxo nao gera dataset visual. Ele existe para producao rapida. Ele so pode ser considerado sucesso quando o PDF final for baixado ou houver uma referencia de PDF validada pelo storage.

### Fluxo Playwright Direto No Flipsnack

1. Abrir `https://www.flipsnack.com/taustesupermercado/`.
2. Entrar no estado `LEAFLETS_PAGE`.
3. Aguardar a secao `Publications` ficar estavel.
4. Listar cards de publicacao visiveis.
5. Filtrar os cards relevantes para encartes Tauste.
6. Antes de clicar em cada card:
   - localizar o alvo com locator robusto;
   - validar visibilidade e disponibilidade;
   - capturar bounding box;
   - capturar screenshot full-page;
   - criar `VisualDatasetSample` com subject de card;
   - persistir ou enfileirar a amostra.
7. Clicar no card.
8. Tratar abertura em nova aba, nova pagina ou modal, conforme o comportamento atual do Flipsnack:
   - se abrir nova aba, usar `page.waitForEvent('popup')` ou evento equivalente no contexto;
   - se usar mesma aba, aguardar URL da publicacao;
   - se abrir modal/overlay, aguardar estado visual do player.
9. Entrar no estado `PDF_DOWNLOAD`.
10. Localizar o botao de download do PDF.
11. Capturar dataset antes do clique com label `download_pdf_button`.
12. Executar download via Playwright `download` event ou extrair `href` validado.
13. Persistir PDF via storage compartilhado de PDF.
14. Fechar aba secundaria/modal e seguir para o proximo card.

Este fluxo e o primeiro fallback quando a API falhar ou nao resolver o PDF.

### Fluxo Playwright Desde O Institucional

1. Abrir `https://institucional.tauste.com.br/`.
2. Entrar no estado `ANCHOR_PAGE`.
3. Localizar o CTA inicial `Veja nossas ofertas`.
4. Capturar dataset antes do clique com label `open_leaflets_page_button`.
5. Clicar e navegar para `https://institucional.tauste.com.br/ofertas`.
6. Aguardar o redirecionamento ou carregamento para `https://www.flipsnack.com/taustesupermercado/`.
7. Entrar no estado `LEAFLETS_PAGE`.
8. Reusar o fluxo Playwright direto no Flipsnack.

Fallback adicional dentro do institucional:

1. Se o CTA inicial nao for encontrado ou nao estiver disponivel, rolar ate o footer.
2. Localizar a coluna `Institucional`.
3. Localizar o link `Ofertas`.
4. Capturar dataset antes do clique com label `open_leaflets_page_button`.
5. Clicar e continuar para o perfil Flipsnack.

Este fluxo e o fallback final e deve continuar existindo mesmo que o perfil Flipsnack funcione diretamente.

## FSM Visual

A implementacao Playwright deve ser modelada como FSM visual. Estados recomendados:

```text
ANCHOR_PAGE
LEAFLETS_PAGE
LEAFLET_MODAL
PDF_DOWNLOAD
ERROR_RECOVERY
```

Mapeamento esperado:

- `ANCHOR_PAGE`: home institucional do Tauste carregada, antes de clicar em `Veja nossas ofertas` ou no link `Ofertas` do footer.
- `LEAFLETS_PAGE`: perfil Flipsnack do Tauste exibindo `Publications` e cards de publicacao.
- `LEAFLET_MODAL`: publicacao Flipsnack aberta em modal, overlay, player ou nova aba antes do download.
- `PDF_DOWNLOAD`: botao de download do PDF visivel e pronto para acao.
- `ERROR_RECOVERY`: usado apenas para logs/falhas tipadas e recuperacoes explicitas.

Se os estados atuais do dominio nao forem suficientes, adicionar novos estados deliberadamente em `src/domain/extraction/fsm-state-name.ts`, com testes.

## Labels E Subjects Visuais

Reusar labels existentes quando fizer sentido:

- `open_leaflets_page_button`: clique em `Veja nossas ofertas` ou link `Ofertas`.
- `open_leaflet_modal_button`: clique no card de publicacao Flipsnack.
- `download_pdf_button`: clique no botao de download do PDF.
- `open_pdf_link`: uso alternativo se a resolucao visual expuser um link direto de PDF em vez de botao.

Se o clique no card abrir uma pagina propria em nova aba e o nome `open_leaflet_modal_button` ficar semanticamente fraco, avaliar criar um label novo:

```ts
'open_leaflet_page_link';
```

Nao inventar labels inline dentro do scraper. Labels devem viver em `src/domain/dataset/target-semantic-label.ts`.

Subjects visuais recomendados em `VisualDatasetSubject`:

```text
tauste-home-offers-link
tauste-footer-offers-link
tauste-publication-card
tauste-pdf-download
```

Campos sugeridos:

- link institucional: `sourceArea`, `href`;
- card: `publicationId`, `publicationTitle`, `publicationUrl`, `publishedAtIso`, `coverImageUrl`;
- download: `publicationId`, `publicationTitle`, `publicationUrl`, `pdfUrl`.

## Estrutura De Arquivos Recomendada

```text
src/infrastructure/scrapers/tauste/
  tauste-targets.ts
  tauste-targets.test.ts
  tauste-pdf-leaflet.ts
  tauste-api-client.ts
  tauste-api-client.test.ts
  tauste-api-extraction.ts
  tauste-api-extraction.test.ts
  tauste-api-strategy-adapter.ts
  tauste-api-strategy-adapter.test.ts
  tauste-leaflet-page.ts
  playwright-tauste-leaflet-page.factory.ts
  tauste-leaflet-extractor.ts
  tauste-leaflet-extractor.test.ts
  tauste-playwright-strategy-adapter.ts
  tauste-playwright-strategy-adapter.test.ts
  tauste-hybrid-strategy.ts
  tauste-hybrid-strategy.test.ts
```

Worker:

```text
src/infrastructure/worker/tauste-command-options.ts
src/infrastructure/worker/tauste-command-options.test.ts
```

Se a implementacao preferir um unico arquivo de command options para API e Playwright, manter nomes claros e testes cobrindo todos os modos.

## Stack Obrigatorio

Antes de criar ou atualizar o stack, ler:

```text
docs/gh-stack-workflow.md
```

Criar o stack a partir de `main` atualizado:

```bash
git checkout main
git pull --ff-only origin main

gh stack init \
  feat/tauste-domain-contracts \
  feat/tauste-api-discovery \
  feat/tauste-pdf-resolution \
  feat/tauste-playwright-page \
  feat/tauste-playwright-extraction \
  feat/tauste-home-navigation \
  feat/tauste-hybrid-strategy \
  feat/tauste-worker-registration
```

Cada branch deve passar nos testes relevantes. O topo deve passar obrigatoriamente:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
npm run verify
```

Depois:

```bash
gh stack submit
```

## Detalhamento Das Branches

### 1. `feat/tauste-domain-contracts`

Escopo:

- adicionar `tauste` em `SupermarketId`;
- adicionar subjects visuais do Tauste;
- adicionar label novo somente se necessario;
- criar targets e constantes de URLs;
- criar contratos tipados para publicacao, PDF e falha.

Arquivos provaveis:

```text
src/domain/supermarket/supermarket-id.ts
src/domain/dataset/visual-dataset-sample.ts
src/domain/dataset/target-semantic-label.ts
src/infrastructure/scrapers/tauste/tauste-targets.ts
src/infrastructure/scrapers/tauste/tauste-targets.test.ts
src/infrastructure/scrapers/tauste/tauste-pdf-leaflet.ts
vitest.config.ts
```

Observacao de cobertura:

- se `tauste-pdf-leaflet.ts` contiver apenas interfaces, excluir de coverage como os contratos equivalentes de outros scrapers;
- adicionar teste para `tauste-targets.ts`.

Commit esperado:

```text
feat(tauste-domain): add monitored tauste contracts
```

### 2. `feat/tauste-api-discovery`

Escopo:

- implementar client HTTP do Flipsnack;
- implementar parser/validador do JSON `publications/related`;
- normalizar `directLink`;
- montar `publicationUrl`;
- gerar IDs deterministicos;
- filtrar publicacoes relevantes para encartes Tauste.

Regras:

- nada de Playwright nesta branch;
- nao usar `any` ou `unknown`;
- resposta JSON deve ser validada por funcoes tipadas;
- falhas devem ser retornadas por publicacao ou como falha de descoberta;
- paginacao deve ser projetada, mesmo que a primeira implementacao use `p=1`.

Testes obrigatorios:

- parse da resposta observada;
- rejeicao de JSON invalido;
- montagem de URL final;
- filtro de publicacoes antigas/permanentes;
- IDs determinisicos;
- erro HTTP.

Commit esperado:

```text
feat(tauste-api): add flipsnack publication discovery
```

### 3. `feat/tauste-pdf-resolution`

Escopo:

- buscar pagina individual da publicacao;
- extrair `accountId`, `flipbookHash`, `playerUrl`, titulo e imagem;
- investigar e implementar endpoint ou HTML que resolve PDF quando disponivel;
- retornar falha tipada quando o PDF nao puder ser resolvido sem browser.

Regras:

- sucesso API exige PDF baixavel;
- cover image sozinha nao e artifact final;
- nao tratar iframe/player como PDF;
- se a URL final vier de endpoint interno Flipsnack, validar origem, content-type e estabilidade.

Testes obrigatorios:

- extrai metadados da pagina individual;
- extrai hash do iframe;
- resolve PDF quando fixture contem URL de download;
- retorna falha quando download nao esta exposto;
- nao confunde cover image com PDF.

Commit esperado:

```text
feat(tauste-api): resolve flipsnack pdf metadata
```

### 4. `feat/tauste-playwright-page`

Escopo:

- criar boundary Playwright sem vazar tipos para dominio/aplicacao;
- encapsular locators;
- encapsular abertura de nova aba/modal;
- encapsular download Playwright.

Metodos recomendados:

```ts
openPage(...)
goto(url)
waitForInstitutionalHomePage()
waitForInstitutionalOffersPage()
waitForFlipsnackProfilePage()
getHeroOffersVisualTarget()
getFooterOffersVisualTarget()
openHeroOffersPage()
openFooterOffersPage()
listPublicationCards()
getPublicationCardVisualTarget(publicationId)
openPublication(publicationId)
waitForPublicationPlayer()
getPdfDownloadVisualTarget()
downloadPdf()
getCurrentUrl()
close()
```

Locator strategy:

- preferir `page.getByRole('link', { name: /veja nossas ofertas/i })`;
- para footer, escopar na coluna `Institucional` quando possivel;
- para Flipsnack, preferir `getByRole('heading', { name: /Publications/i })` e cards por titulo;
- para download, preferir role/button/link com nome acessivel de download;
- CSS selectors somente dentro de metodos nomeados;
- XPath deve ser evitado.

Commit esperado:

```text
feat(tauste-playwright): add leaflet page boundary
```

### 5. `feat/tauste-playwright-extraction`

Escopo:

- implementar extrator Playwright comecando diretamente no perfil Flipsnack;
- capturar dataset antes de clicar nos cards;
- abrir publicacao;
- capturar dataset antes do botao de download;
- baixar PDF completo;
- persistir resultado via adapter Playwright.

Input recomendado:

```ts
startUrlMode: 'flipsnack-profile'
profileUrl: TAUSTE_FLIPSNACK_PROFILE_URL
visualDataset?: { runId: string; split: DatasetSplit }
```

Comportamento:

- uma publicacao falhando nao deve impedir as demais;
- logar `publicationId`, `publicationTitle`, `runId`, estado FSM e motivo de falha;
- fechar abas secundarias e modais no `finally`;
- nao considerar capa como encarte final.

Commit esperado:

```text
feat(tauste-playwright): add direct flipsnack extraction
```

### 6. `feat/tauste-home-navigation`

Escopo:

- implementar modo desde o institucional;
- capturar CTA `Veja nossas ofertas`;
- implementar fallback visual pelo footer `Institucional > Ofertas`;
- reutilizar fluxo de publicacoes do Flipsnack.

Input recomendado:

```ts
startUrlMode: 'institutional-home';
institutionalHomeUrl: TAUSTE_INSTITUTIONAL_HOME_URL;
institutionalOffersUrl: TAUSTE_INSTITUTIONAL_OFFERS_URL;
profileUrl: TAUSTE_FLIPSNACK_PROFILE_URL;
```

Testes:

- quando `startUrlMode` for `institutional-home`, deve chamar home -> ofertas -> Flipsnack -> card -> download;
- quando o CTA inicial falhar, deve tentar footer;
- deve capturar amostra visual antes do CTA inicial;
- deve capturar amostra visual antes do link do footer quando usado;
- deve registrar falha tipada quando nenhuma rota institucional existir.

Commit esperado:

```text
feat(tauste-playwright): add institutional navigation fallback
```

### 7. `feat/tauste-hybrid-strategy`

Escopo:

- criar orquestrador da ordem:

```text
API/PDF
  -> direct Flipsnack Playwright
    -> institutional Playwright
```

Regra principal:

- fallback so deve acontecer quando a camada anterior falhar ou nao retornar PDFs validos;
- resultado final deve indicar a fonte usada;
- logs devem explicar cada fallback;
- discovery API sem PDF nao e sucesso.

Estados de resultado:

- `succeeded`: todas as publicacoes elegiveis foram baixadas;
- `partially_succeeded`: pelo menos uma publicacao baixada e outra falhou;
- `failed`: nenhuma publicacao baixada.

Commit esperado:

```text
feat(tauste-hybrid): add api and visual fallback strategy
```

### 8. `feat/tauste-worker-registration`

Escopo:

- adicionar command options;
- registrar strategies no worker;
- adicionar target `tauste`;
- criar scripts opcionais no `package.json`, se o padrao atual do projeto tiver scripts por supermercado.

Opcoes/envs sugeridas:

```text
TAUSTE_INSTITUTIONAL_HOME_URL
TAUSTE_INSTITUTIONAL_OFFERS_URL
TAUSTE_FLIPSNACK_PROFILE_URL
TAUSTE_FLIPSNACK_API_BASE_URL
TAUSTE_FLIPSNACK_ACCOUNT_ID
TAUSTE_OUTPUT_DIR
TAUSTE_VISUAL_DATASET_DIR
TAUSTE_VISUAL_DATASET_ENABLED
TAUSTE_VISUAL_DATASET_SPLIT
TAUSTE_TIMEOUT_MS
TAUSTE_SETTLE_DELAY_MS
TAUSTE_WIDTH
TAUSTE_HEIGHT
TAUSTE_DEVICE_SCALE_FACTOR
TAUSTE_START_URL_MODE
```

Valores default:

```text
TAUSTE_INSTITUTIONAL_HOME_URL=https://institucional.tauste.com.br/
TAUSTE_INSTITUTIONAL_OFFERS_URL=https://institucional.tauste.com.br/ofertas
TAUSTE_FLIPSNACK_PROFILE_URL=https://www.flipsnack.com/taustesupermercado/
TAUSTE_FLIPSNACK_API_BASE_URL=https://api.flipsnack.com/v2
TAUSTE_FLIPSNACK_ACCOUNT_ID=9D99E5AF8D6
TAUSTE_START_URL_MODE=flipsnack-profile
```

O worker hibrido deve continuar tentando API primeiro independentemente do `TAUSTE_START_URL_MODE`; esse modo controla apenas qual fluxo Playwright sera usado quando houver fallback, ou pode ser usado para comandos manuais.

Commit esperado:

```text
feat(tauste-worker): register tauste hybrid extraction
```

## Regras De Persistencia

Usar o storage compartilhado de PDF:

```text
src/infrastructure/storage/leaflet-pdf-storage.ts
```

Cada encarte deve gerar:

- identificador estavel de leaflet;
- source page URL;
- URL final do PDF ou referencia validada de download;
- titulo da publicacao;
- data de publicacao;
- metadados Flipsnack relevantes;
- PDF baixado ou reutilizado.

Nao salvar apenas a capa. A capa pode ser metadado auxiliar, mas o artifact de negocio do Tauste e o PDF completo.

## Estrategia De IDs

Gerar IDs deterministicos a partir de campos estaveis:

```text
tauste:{publicationSlugOuHash}
```

Preferencia:

1. `directLink` sem `.html`;
2. `flipbookHash`;
3. slug normalizado do titulo + data de publicacao;
4. indice da publicacao somente como ultimo recurso.

Evitar IDs baseados em timestamp.

## Erros E Fallbacks

Falhas esperadas:

- endpoint `publications/related` indisponivel;
- JSON Flipsnack muda de formato;
- publicacao sem `directLink`;
- pagina individual nao expoe iframe/player;
- player nao expoe PDF por API/HTML;
- perfil Flipsnack nao carrega;
- secao `Publications` nao aparece;
- card abre em comportamento diferente;
- botao de download nao aparece;
- download retorna arquivo nao PDF;
- Cloudflare/timeout;
- bounding box nulo;
- target invisivel.

Cada falha deve gerar log claro e, quando for por publicacao, deve preencher `failedPublications`.

Fallbacks:

```text
API falhou totalmente
  -> tentar Playwright direto no Flipsnack

API descobriu publicacoes mas nao resolveu PDFs
  -> tentar Playwright direto para as publicacoes elegiveis

Playwright direto falhou totalmente
  -> tentar Playwright desde o institucional

Playwright direto extraiu parte das publicacoes
  -> tentar institucional somente para as falhadas, se a arquitetura permitir
```

Nao engolir erro silenciosamente. Todo fallback deve ter log com motivo.

## Testes Minimos

Testes de dominio/targets:

- `tauste` aceito como `SupermarketId`;
- constantes de URLs validas;
- accountId Flipsnack nao vazio;
- subjects visuais tipados.

Testes API:

- parse de `publications/related`;
- validacao de JSON invalido;
- montagem de `publicationUrl`;
- extracao de metadados da pagina individual;
- resolucao de PDF quando disponivel;
- falha quando so ha capa;
- erro HTTP;
- sucesso parcial.

Testes Playwright com mocks:

- modo direto inicia pelo perfil Flipsnack;
- modo institucional captura `Veja nossas ofertas` antes do clique;
- fallback institucional captura footer `Ofertas` antes do clique;
- card de publicacao abre nova aba/modal;
- botao download sem bounding box falha;
- pagina sem `Publications` gera falha tipada;
- uma publicacao falhando nao impede as demais;
- download nao PDF gera falha.

Testes adapter/hibrido:

- API sucesso nao chama Playwright;
- API falha chama Playwright direto;
- Playwright direto falha chama institucional;
- sucesso parcial preserva failures;
- contagem de dataset samples usa diretorio visual correto.

Worker/options:

- defaults corretos;
- env override;
- CLI override;
- valores invalidos rejeitados;
- strategy registrada para `tauste`.

## Comandos De Verificacao Durante O Desenvolvimento

Usar Node 24 sempre:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
```

Comandos uteis por etapa:

```bash
npm run typecheck
npm run typecheck:test
npm run lint
npm run test -- tauste
npm run test:coverage -- tauste
npm run verify
```

Se `npm run test:coverage -- tauste` falhar por threshold global de arquivos fora do filtro, rodar `npm run verify` completo antes de declarar prontidao.

Se `npm run verify` falhar por arquivos locais nao rastreados fora do escopo, nao apagar trabalho do usuario. Isolar temporariamente esses arquivos fora da arvore, rodar o gate, e restaurar depois.

## Smoke Manual Recomendado

Depois do worker registrado, rodar um smoke com apenas Tauste e uma execucao:

```bash
npm run worker -- --only tauste --run-once true
```

Para validar API:

```bash
npm run worker -- --only tauste --extraction-mode api --run-once --visual-dataset-capture-policy disabled
```

Para validar Playwright direto:

```bash
npm run worker -- --only tauste --extraction-mode playwright --run-once --tauste-start-url-mode flipsnack-profile
```

Para validar fallback institucional:

```bash
npm run worker -- --only tauste --extraction-mode playwright --run-once --tauste-start-url-mode institutional-home
```

Validar saidas:

- PDFs baixados em `.data/leaflets-playwright` ou diretorio configurado;
- dataset visual criado em `.data/visual-dataset`;
- logs com `runId`, `supermarketId=tauste`, `publicationId` e fonte usada;
- cada encarte com PDF completo e content-type validado.

## Pontos De Retomada Se Parar No Meio

1. Verificar branch atual:

```bash
git status --short --branch
gh stack view --short
```

2. Verificar ultimo commit:

```bash
git log --oneline --decorate -10
```

3. Identificar qual branch do stack esta incompleta:

```text
feat/tauste-domain-contracts
feat/tauste-api-discovery
feat/tauste-pdf-resolution
feat/tauste-playwright-page
feat/tauste-playwright-extraction
feat/tauste-home-navigation
feat/tauste-hybrid-strategy
feat/tauste-worker-registration
```

4. Rodar testes focados da branch:

```bash
npm run test -- tauste
npm run typecheck
npm run lint
```

5. Antes de subir ou dizer que esta pronto:

```bash
npm run verify
gh stack submit
gh pr list --state open --json number,title,headRefName,baseRefName,statusCheckRollup,url --limit 20
```

## Criterio De Pronto

A implementacao Tauste so deve ser considerada pronta quando:

- API descobre publicacoes atuais do Flipsnack ou retorna falhas tipadas;
- API so marca sucesso quando o PDF final e resolvido e baixado;
- Playwright direto funciona como fallback usando o perfil Flipsnack;
- Playwright desde o institucional funciona como fallback final;
- dataset visual e capturado antes das acoes Playwright;
- PDF completo e baixado, nao apenas capa;
- uma publicacao falhando nao derruba as demais;
- worker registra `tauste`;
- testes cobrem API, Playwright, fallback hibrido e options;
- `npm run verify` passa no topo do stack;
- todos os PRs do stack ficam verdes no GitHub.
