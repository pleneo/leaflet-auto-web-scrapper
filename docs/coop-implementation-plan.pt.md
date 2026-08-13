# Plano De Implementacao: Coop Supermercados

Este documento descreve a implementacao completa da extracao de encartes da Coop Supermercados. Ele existe para permitir retomada segura caso o desenvolvimento seja interrompido, falhe em algum ponto do stack, ou precise ser continuado por outro agente.

## Objetivo

Implementar uma estrategia hibrida para a Coop Supermercados, preservando os dois objetivos do projeto:

- extracao de negocio: encontrar e baixar os encartes completos das lojas monitoradas;
- dataset visual: quando Playwright for usado, capturar screenshot full-page, bounding box, estado FSM e label semantico antes de cada acao relevante.

A ordem de tentativa deve ser:

```text
API/HTML
  -> fallback Playwright direto nas paginas finais das lojas
    -> fallback Playwright desde a home
```

A camada API e a camada Playwright direta podem usar os links finais conhecidos. A camada Playwright desde a home deve provar que ainda e possivel navegar como um usuario humano ate os mesmos encartes.

## Lojas Monitoradas

As lojas iniciais observadas sao:

```text
coop-super-agua-verde
  Nome: Cooper Super Agua Verde
  URL final: https://www.cooper.coop.br/ofertas/blumenau/agua-verde

coop-atacarejo-boa-vista
  Nome: Cooper Atacarejo Boa Vista
  URL final: https://www.cooper.coop.br/ofertas/atacarejo-joinville/
```

O ponto de entrada estavel para navegacao visual e:

```text
https://www.cooper.coop.br/
```

O ponto intermediario de ofertas e:

```text
https://www.cooper.coop.br/ofertas
```

## Fluxo Funcional Esperado

### Fluxo API/HTML

1. Fazer fetch de `https://www.cooper.coop.br/ofertas`.
2. Resolver os links das lojas monitoradas a partir do HTML.
3. Fazer fetch da pagina final de cada loja.
4. Extrair os cards de encarte disponiveis.
5. Fazer fetch de cada pagina de encarte, caso o card aponte para uma pagina propria.
6. Extrair uma ou mais URLs de imagens do encarte.
7. Persistir as imagens usando o storage compartilhado de galerias.

Este fluxo nao gera dataset visual. Ele existe para producao rapida.

### Fluxo Playwright Direto

1. Abrir diretamente a URL final da loja monitorada.
2. Aguardar a pagina de ofertas da loja ficar estavel.
3. Listar os cards de encarte.
4. Antes de clicar em cada card:
   - localizar o alvo com locator robusto;
   - validar visibilidade e disponibilidade;
   - capturar bounding box;
   - capturar screenshot full-page;
   - criar `VisualDatasetSample`.
5. Clicar no card.
6. Tratar abertura em nova aba com `page.waitForEvent('page')`, quando aplicavel.
7. Na pagina/aba do encarte, extrair todas as imagens.
8. Capturar amostras visuais para imagens ou alvos de galeria quando houver acao/estado visual relevante.
9. Fechar a aba secundaria e seguir para o proximo card.

Este fluxo e o primeiro fallback quando a API falhar.

### Fluxo Playwright Desde A Home

1. Abrir `https://www.cooper.coop.br/`.
2. Entrar no estado `ANCHOR_PAGE`.
3. Localizar o link ou botao visivel `Ofertas` no topo.
4. Capturar dataset antes do clique com label `open_leaflets_page_button`.
5. Clicar e navegar para `https://www.cooper.coop.br/ofertas`.
6. Entrar no estado `LEAFLETS_PAGE`.
7. Localizar os links das lojas monitoradas:
   - `cooper super AGUA VERDE`;
   - `COOPER ATACAREJO BOA VISTA`.
8. Capturar dataset antes de clicar no link da loja com label apropriado para selecao de loja.
9. Navegar para a pagina final da loja.
10. Reusar o mesmo fluxo de cards/encarte do Playwright direto.

Este fluxo e o fallback final e deve continuar existindo mesmo que os links finais funcionem.

## FSM Visual

A implementacao Playwright deve ser modelada como FSM visual. Estados recomendados:

```text
ANCHOR_PAGE
LEAFLETS_PAGE
STORE_SELECTION
IMAGE_GALLERY
ERROR_RECOVERY
```

Mapeamento esperado:

- `ANCHOR_PAGE`: home da Coop carregada, antes de clicar em `Ofertas`.
- `LEAFLETS_PAGE`: pagina `/ofertas` exibindo lojas e filiais.
- `STORE_SELECTION`: alvo da loja monitorada identificado ou pagina final da loja carregada.
- `IMAGE_GALLERY`: pagina/aba de encarte com uma ou mais imagens.
- `ERROR_RECOVERY`: usado apenas para logs/falhas tipadas e recuperacoes explicitas.

Se os estados atuais do dominio nao forem suficientes, adicionar novos estados deliberadamente em `src/domain/extraction/fsm-state-name.ts`, com testes.

## Labels E Subjects Visuais

Reusar labels existentes quando fizer sentido:

- `open_leaflets_page_button`: clique em `Ofertas` na home.
- `select_store_button`: clique no link da loja na pagina `/ofertas`.
- `open_leaflet_modal_button` ou novo label: clique no card de encarte.
- `extract_leaflet_image`: captura de imagem do encarte.

Se o clique no card abrir uma nova pagina/aba, avaliar criar label novo:

```ts
'open_leaflet_page_link';
```

Nao inventar labels inline dentro do scraper. Labels devem viver em `src/domain/dataset/target-semantic-label.ts`.

Subjects visuais recomendados em `VisualDatasetSubject`:

```text
coop-home-offers-link
coop-store-link
coop-leaflet-card
coop-leaflet-image
```

Campos sugeridos:

- loja: `storeSlug`, `storeName`, `storeUrl`;
- card: `cardIndex`, `leafletId`, `leafletTitle`;
- imagem: `imageIndex`, `imageUrl`.

## Estrutura De Arquivos Recomendada

```text
src/infrastructure/scrapers/coop/
  coop-targets.ts
  coop-targets.test.ts
  coop-image-gallery-leaflet.ts
  coop-api-client.ts
  coop-api-client.test.ts
  coop-api-extraction.ts
  coop-api-extraction.test.ts
  coop-api-strategy-adapter.ts
  coop-api-strategy-adapter.test.ts
  coop-leaflet-page.ts
  playwright-coop-leaflet-page.factory.ts
  coop-leaflet-extractor.ts
  coop-leaflet-extractor.test.ts
  coop-playwright-strategy-adapter.ts
  coop-playwright-strategy-adapter.test.ts
```

Worker:

```text
src/infrastructure/worker/coop-playwright-command-options.ts
src/infrastructure/worker/coop-playwright-command-options.test.ts
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
  feat/coop-domain-contracts \
  feat/coop-api-extraction \
  feat/coop-playwright-page \
  feat/coop-direct-playwright-extraction \
  feat/coop-home-playwright-extraction \
  feat/coop-hybrid-strategy \
  feat/coop-worker-registration
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

### 1. `feat/coop-domain-contracts`

Escopo:

- adicionar `coop` em `SupermarketId`;
- adicionar subjects visuais da Coop;
- adicionar label novo somente se necessario;
- criar targets monitorados;
- criar contratos tipados para unidade, card, leaflet e falha.

Arquivos provaveis:

```text
src/domain/supermarket/supermarket-id.ts
src/domain/dataset/visual-dataset-sample.ts
src/domain/dataset/target-semantic-label.ts
src/infrastructure/scrapers/coop/coop-targets.ts
src/infrastructure/scrapers/coop/coop-targets.test.ts
src/infrastructure/scrapers/coop/coop-image-gallery-leaflet.ts
vitest.config.ts
```

Observacao de cobertura:

- se `coop-image-gallery-leaflet.ts` contiver apenas interfaces, excluir de coverage como os contratos equivalentes de outros scrapers;
- adicionar teste para `coop-targets.ts`.

Commit esperado:

```text
feat(coop-domain): add monitored coop contracts
```

### 2. `feat/coop-api-extraction`

Escopo:

- implementar parser de HTML;
- implementar client HTTP;
- implementar service de extracao API;
- implementar adapter para strategy API;
- reusar `LocalSharedImageGalleryStorage`.

Regras:

- nada de Playwright nesta branch;
- parser deve usar APIs estruturadas disponiveis no projeto quando possivel;
- tratar charset/acentos com cuidado, pois o HTML da Coop pode vir como `iso-8859-1`;
- falhas devem ser retornadas por unidade sem derrubar toda a execucao quando uma loja falhar.

Testes obrigatorios:

- lista lojas monitoradas a partir de `/ofertas`;
- extrai cards de uma pagina final;
- extrai varias imagens de um encarte;
- retorna falha quando loja monitorada nao existe;
- retorna falha quando card nao tem imagens;
- cobre URLs com e sem barra final.

Commit esperado:

```text
feat(coop-api): add html image gallery extraction
```

### 3. `feat/coop-playwright-page`

Escopo:

- criar boundary Playwright sem vazar tipos para dominio/aplicacao;
- encapsular locators;
- encapsular abertura de nova aba.

Metodos recomendados:

```ts
openPage(...)
goto(url)
waitForHomePage()
waitForOffersPage()
waitForStoreOffersPage(storeSlug)
getHomeOffersVisualTarget()
getStoreLinkVisualTarget(storeSlug)
openHomeOffersPage()
openStore(storeSlug)
listLeafletCards()
getLeafletCardVisualTarget(cardIndex)
openLeafletCardInNewPage(cardIndex)
waitForImageGallery()
listLeafletImageUrls()
getLeafletImageVisualTarget(imageIndex)
getCurrentUrl()
close()
```

Locator strategy:

- preferir `getByRole('link', { name: /ofertas/i })`;
- para lojas, preferir texto visivel normalizado;
- CSS selectors somente dentro de metodos nomeados;
- XPath deve ser evitado.

Commit esperado:

```text
feat(coop-playwright): add leaflet page boundary
```

### 4. `feat/coop-direct-playwright-extraction`

Escopo:

- implementar extrator Playwright começando diretamente nas URLs finais;
- capturar dataset antes de clicar em cards;
- extrair imagens completas;
- persistir resultado via adapter Playwright.

Input recomendado:

```ts
startUrlMode: 'store-page'
monitoredStores: readonly CoopMonitoredStore[]
visualDataset?: { runId: string; split: DatasetSplit }
```

Comportamento:

- uma loja falhando nao deve impedir a outra;
- logar `storeSlug`, `storeName`, `runId`, estado FSM e motivo de fallback/falha;
- fechar abas secundarias e paginas no `finally`.

Commit esperado:

```text
feat(coop-playwright): add direct store extraction
```

### 5. `feat/coop-home-playwright-extraction`

Escopo:

- implementar modo desde a home;
- capturar link `Ofertas`;
- capturar link da loja em `/ofertas`;
- reutilizar fluxo de cards da branch anterior.

Input recomendado:

```ts
startUrlMode: 'home';
homeUrl: COOP_HOME_URL;
offersUrl: COOP_OFFERS_URL;
```

Testes:

- quando `startUrlMode` for `home`, deve chamar home -> ofertas -> loja -> card;
- quando uma loja nao for encontrada em `/ofertas`, deve registrar falha tipada;
- deve capturar amostra visual antes de `Ofertas` e antes da loja.

Commit esperado:

```text
feat(coop-playwright): add home navigation fallback
```

### 6. `feat/coop-hybrid-strategy`

Escopo:

- criar orquestrador da ordem:

```text
API -> direct-store Playwright -> home Playwright
```

Opcoes de design:

- usar `HybridExtractionStrategy` existente se ele suportar apenas dois niveis e compor Playwright direto/home dentro de uma strategy Playwright;
- ou criar um adapter Coop especifico que tente tres portas explicitamente.

Regra principal:

- fallback so deve acontecer quando a camada anterior falhar ou nao retornar encartes validos;
- resultado final deve indicar a fonte usada;
- logs devem explicar cada fallback.

Estados de resultado:

- `succeeded`: todas as lojas monitoradas extraidas;
- `partially_succeeded`: pelo menos uma loja extraida e outra falhou;
- `failed`: nenhuma loja extraida.

Commit esperado:

```text
feat(coop-hybrid): add three-stage extraction strategy
```

### 7. `feat/coop-worker-registration`

Escopo:

- adicionar command options;
- registrar strategies no worker;
- adicionar target `coop`;
- criar script opcional no `package.json`, se o padrao atual do projeto tiver scripts por supermercado.

Opcoes/envs sugeridas:

```text
COOP_HOME_URL
COOP_OFFERS_URL
COOP_OUTPUT_DIR
COOP_VISUAL_DATASET_DIR
COOP_VISUAL_DATASET_ENABLED
COOP_VISUAL_DATASET_SPLIT
COOP_TIMEOUT_MS
COOP_SETTLE_DELAY_MS
COOP_WIDTH
COOP_HEIGHT
COOP_DEVICE_SCALE_FACTOR
COOP_START_URL_MODE
```

Valores default:

```text
COOP_HOME_URL=https://www.cooper.coop.br/
COOP_OFFERS_URL=https://www.cooper.coop.br/ofertas
COOP_START_URL_MODE=store-page
```

O worker hibrido deve continuar tentando API primeiro independentemente do `COOP_START_URL_MODE`; esse modo controla apenas qual fluxo Playwright sera usado quando houver fallback, ou pode ser usado para comandos manuais.

Commit esperado:

```text
feat(coop-worker): register coop hybrid extraction
```

## Regras De Persistencia

Usar o storage compartilhado de galeria:

```text
src/infrastructure/storage/shared-image-gallery-storage.ts
```

Cada encarte deve gerar:

- identificador estavel de leaflet;
- source page URL;
- cover image URL;
- lista completa de imagens;
- unidade/loja associada;
- imagens baixadas ou reutilizadas.

Nao salvar apenas a primeira imagem. O encarte completo e a lista inteira de imagens.

## Estrategia De IDs

Gerar IDs deterministicos a partir de campos estaveis:

```text
coop:{storeSlug}:{leafletSlugOuCardIndex}
```

Se o site nao expuser slug de encarte confiavel, derivar de:

- URL do card;
- titulo normalizado;
- indice do card como ultimo recurso.

Evitar IDs baseados em timestamp.

## Erros E Fallbacks

Falhas esperadas:

- `/ofertas` nao carrega;
- loja monitorada nao aparece;
- pagina final nao expoe cards;
- card abre pagina sem imagens;
- nova aba nao abre;
- bounding box nulo;
- target invisivel;
- Cloudflare/timeout;
- imagem retorna status invalido.

Cada falha deve gerar log claro e, quando for por loja, deve preencher `failedUnits`.

Fallbacks:

```text
API falhou totalmente
  -> tentar Playwright direto para todas as lojas

API extraiu uma loja e falhou outra
  -> preferencialmente tentar Playwright para a loja falhada
  -> se a implementacao inicial for mais simples, pode tentar Playwright para todas e deduplicar pelo storage

Playwright direto falhou totalmente
  -> tentar Playwright desde a home

Playwright direto extraiu uma loja e falhou outra
  -> tentar home somente para loja falhada, se a arquitetura permitir
```

Nao engolir erro silenciosamente. Todo fallback deve ter log com motivo.

## Testes Minimos

Testes de dominio/targets:

- `coop` aceito como `SupermarketId`;
- lista de lojas monitoradas tem duas lojas;
- URLs absolutas e sem duplicidade;
- busca por slug/URL funciona com e sem trailing slash.

Testes API:

- parse de `/ofertas`;
- parse da pagina final da loja;
- parse de cards;
- parse de imagens;
- loja ausente;
- card sem imagem;
- erro HTTP;
- sucesso parcial.

Testes Playwright com mocks:

- modo direto inicia pela URL final;
- modo home captura `Ofertas` antes do clique;
- modo home captura loja antes do clique;
- card abre nova aba;
- imagem sem bounding box falha;
- pagina sem cards gera falha tipada;
- uma loja falhando nao impede a outra.

Testes adapter/hibrido:

- API sucesso nao chama Playwright;
- API falha chama Playwright direto;
- Playwright direto falha chama home;
- sucesso parcial preserva failures;
- contagem de dataset samples usa diretorio visual correto.

Worker/options:

- defaults corretos;
- env override;
- CLI override;
- valores invalidos rejeitados;
- strategy registrada para `coop`.

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
npm run test -- coop
npm run test:coverage -- coop
npm run verify
```

Se `npm run verify` falhar por arquivos locais nao rastreados fora do escopo, nao apagar trabalho do usuario. Isolar temporariamente esses arquivos fora da arvore, rodar o gate, e restaurar depois.

## Smoke Manual Recomendado

Depois do worker registrado, rodar um smoke com apenas Coop e uma execucao:

```bash
npm run worker -- --only coop --run-once true
```

Se o projeto usar outro nome para `run-once`, verificar `src/infrastructure/worker/extraction-worker-command-options.ts`.

Para forcar fallback visual, usar env/opcao que desabilite API somente se a implementacao expuser esse controle. Caso contrario, simular falha da API em teste automatizado.

Validar saidas:

- imagens baixadas em `.data/leaflets-playwright` ou diretorio configurado;
- dataset visual criado em `.data/visual-dataset`;
- logs com `runId`, `supermarketId=coop`, `storeSlug` e fonte usada;
- cada encarte com todas as imagens esperadas.

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
feat/coop-domain-contracts
feat/coop-api-extraction
feat/coop-playwright-page
feat/coop-direct-playwright-extraction
feat/coop-home-playwright-extraction
feat/coop-hybrid-strategy
feat/coop-worker-registration
```

4. Rodar testes focados da branch:

```bash
npm run test -- coop
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

A implementacao Coop so deve ser considerada pronta quando:

- API extrai encartes das duas lojas ou retorna falhas tipadas;
- Playwright direto funciona como fallback usando os links finais;
- Playwright desde a home funciona como fallback final;
- dataset visual e capturado antes das acoes Playwright;
- encarte completo e baixado, nao apenas capa;
- uma loja falhando nao derruba a outra;
- worker registra `coop`;
- testes cobrem API, Playwright, fallback hibrido e options;
- `npm run verify` passa no topo do stack;
- todos os PRs do stack ficam verdes no GitHub.
