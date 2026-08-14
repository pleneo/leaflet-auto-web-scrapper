# Plano De Implementacao: Bistek Supermercados

Este documento descreve uma estrategia completa para implementar a extracao de encartes do Bistek Supermercados. Ele foi escrito para permitir que outro agente continue o trabalho sem depender do contexto da conversa original.

## Objetivo

Implementar uma estrategia hibrida para o Bistek, preservando os dois objetivos do projeto:

- extracao de negocio: descobrir todas as cidades, todas as lojas de cada cidade e baixar todos os encartes publicados para cada loja;
- dataset visual: quando Playwright for usado, capturar screenshot full-page, bounding box, estado FSM e label semantico antes de cada acao relevante.

A ordem de tentativa deve ser:

```text
API-like HTTP
  -> parsing HTML das ofertas por loja
    -> fallback Playwright no fluxo de cidade/loja
      -> fallback Playwright desde o inicio do fluxo visual completo
```

O Bistek nao expoe, ate a analise atual, uma API JSON formal para ofertas. Mesmo assim, a pagina usa um endpoint simples de selecao de loja e renderiza os encartes no HTML. Por isso, a primeira camada deve ser tratada como `api-like`: HTTP com cookies, POST de selecao de loja e parsing tipado do HTML.

## Fontes Observadas

Ponto de entrada estavel:

```text
https://institucional.bistek.com.br/ofertas
```

O HTML inicial contem o modal de selecao de loja:

```text
#select_lojas
#cidades_list
#lojas_list
```

O HTML inicial tambem contem as listas de cidades e lojas como variaveis JavaScript:

```js
var lojas = [...]
var cidades_list = {...}
```

O JavaScript do site popula os selects no cliente e, ao selecionar uma loja, executa:

```text
POST https://institucional.bistek.com.br/lojas/loja_selecionada/{lojaId}
```

Esse POST grava o cookie:

```text
bistek[loja_selecionada]={lojaId}
```

Depois, um novo GET para `/ofertas` com o mesmo cookie renderiza os encartes da loja selecionada:

```text
GET https://institucional.bistek.com.br/ofertas
```

Exemplo confirmado em 2026-08-14:

```text
POST /lojas/loja_selecionada/2
Set-Cookie: bistek[loja_selecionada]=2
GET /ofertas
Pagina renderizada: "Confira as ofertas de Blumenau"
```

Os encartes aparecem em blocos:

```text
.oferta
.titulo_oferta
.capa_oferta a[data-fancybox]
.oferta_paginas a[data-fancybox]
```

O formato observado e galeria de imagens. O botao de download do Fancybox aponta para a imagem `.jpg` da pagina atual, nao para PDF:

```text
a.fancybox-button--download[download][href$=".jpg"]
```

Portanto, o dominio deve persistir os encartes do Bistek como:

```text
fileFormat = 'image-gallery'
```

## Dados Observados

Na analise de 2026-08-14, a pagina expunha 18 cidades e 28 lojas.

Exemplos de cidades:

```text
4338: SC - Balneario Camboriu
4348: SC - Blumenau
4359: SC - Brusque
4379: SC - Cocal do Sul
4386: SC - Criciuma
4399: SC - Florianopolis
4437: SC - Itajai
4448: SC - Joinville
4452: SC - Lages
4480: SC - Navegantes
4484: SC - Nova Veneza
4492: SC - Palhoca
4560: SC - Sao Jose
4932: RS - Porto Alegre
5025: RS - Sapiranga
5058: RS - Torres
5059: RS - Tramandai
```

Exemplos de lojas:

```text
id=2, cidade=4348, loja=Loja No 4 - Bairro Garcia
id=3, cidade=4348, loja=Loja No 17 - Shopping Park Europeu
id=7, cidade=4386, loja=Loja No 2 - Centro
id=6, cidade=4386, loja=Loja No 10 - Centro / Terminal Central
```

Nao hardcodar esta lista como unica fonte de verdade. A camada HTTP deve descobrir as lojas no HTML atual. Uma lista estatica pode existir apenas como fixture de teste ou fallback documentado.

## Arquitetura Alvo

Adicionar os arquivos principais:

```text
src/infrastructure/scrapers/bistek/
  bistek-targets.ts
  bistek-api-client.ts
  bistek-api-extraction.ts
  bistek-api-strategy-adapter.ts
  bistek-hybrid-strategy.ts
  bistek-leaflet-page.ts
  playwright-bistek-leaflet-page.factory.ts
  bistek-leaflet-extractor.ts
  bistek-playwright-strategy-adapter.ts
```

Arquivos de testes esperados:

```text
src/infrastructure/scrapers/bistek/
  bistek-targets.test.ts
  bistek-api-client.test.ts
  bistek-api-extraction.test.ts
  bistek-hybrid-strategy.test.ts
  bistek-leaflet-extractor.test.ts
  playwright-bistek-leaflet-page.factory.test.ts
  bistek-playwright-strategy-adapter.test.ts
```

Wiring esperado:

```text
src/domain/supermarket/supermarket-id.ts
src/domain/leaflet/leaflet-metadata.ts
src/domain/dataset/visual-dataset-sample.ts
src/domain/dataset/target-semantic-label.ts
src/infrastructure/worker/extraction-worker-command.ts
src/infrastructure/worker/*bistek*command-options.ts
package.json
```

## Mudancas De Dominio

Adicionar `bistek` ao tipo `SupermarketId`.

Adicionar metadata tipada:

```ts
export interface BistekLeafletMetadata {
  readonly metadataKind: 'bistek';
  readonly capturedAtIso: string;
  readonly sourcePageUrl: string;
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly cityId: string;
  readonly storeId: string;
  readonly storeName: string;
}
```

Adicionar ao union `LeafletMetadata`.

Labels existentes que ja cobrem quase todo o fluxo:

```ts
'select_city_button';
'select_store_button';
'open_leaflet_modal_button';
'extract_leaflet_image';
'next_gallery_image_button';
'previous_gallery_image_button';
'close_modal_button';
```

Recomendacao: adicionar um label especifico para o botao visual de download de imagem, porque `download_pdf_button` e semanticamente incorreto para o Bistek:

```ts
'download_image_button';
```

Se o escopo inicial nao clicar no botao de download e baixar as imagens diretamente dos links `a[data-fancybox]`, o label novo pode ser adiado. Ainda assim, o fluxo Playwright deve capturar pelo menos o card do encarte e, quando abrir o modal, a imagem ou controle relevante antes da acao de extracao.

Adicionar subjects tipados em `VisualDatasetSampleSubject`, por exemplo:

```ts
export interface BistekCitySelectionSubject {
  readonly subjectKind: 'bistek-city-selection';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
}

export interface BistekStoreSelectionSubject {
  readonly subjectKind: 'bistek-store-selection';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
}

export interface BistekLeafletCardSubject {
  readonly subjectKind: 'bistek-leaflet-card';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface BistekLeafletImageSubject {
  readonly subjectKind: 'bistek-leaflet-image';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly imageIndex: number;
  readonly leafletTitle: string;
}

export interface BistekModalCloseSubject {
  readonly subjectKind: 'bistek-modal-close';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}
```

## Contratos De Infraestrutura

Criar tipos especificos para evitar `any` e `unknown`.

```ts
export interface BistekCity {
  readonly cityId: string;
  readonly stateCode: string;
  readonly cityName: string;
  readonly displayName: string;
}

export interface BistekStore {
  readonly storeId: string;
  readonly cityId: string;
  readonly storeName: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface BistekMonitoredStore {
  readonly cityId: string;
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly storeSlug: string;
}

export interface BistekLeafletImage {
  readonly imageIndex: number;
  readonly imageUrl: string;
  readonly title: string;
}

export interface ExtractedBistekImageGalleryLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
}
```

O `leafletId` deve ser deterministico. Sugestao:

```text
bistek-{storeSlug}-{ofertaId}
```

O `ofertaId` pode vir de `data-fancybox="Oferta-1897"`. Se ausente, usar slug do titulo + hash curto das URLs de imagem.

## Fluxo API-like HTTP

Este fluxo deve ser a primeira tentativa quando `visualDatasetEnabled=false`.

1. Fazer `GET https://institucional.bistek.com.br/ofertas`.
2. Extrair e validar `var cidades_list` e `var lojas`.
3. Mapear cidades:
   - separar `displayName`, `stateCode` e `cityName`;
   - exemplo: `SC - Blumenau` vira `stateCode='SC'`, `cityName='Blumenau'`.
4. Mapear lojas:
   - `id` vira `storeId`;
   - `cidade` vira `cityId`;
   - `loja` vira `storeName`;
   - latitude/longitude `0.00000000` devem virar `null` se forem placeholders.
5. Combinar lojas com cidades.
6. Para cada loja:
   - iniciar cookie jar ou sessao HTTP isolada;
   - fazer `GET /ofertas` para obter cookie de sessao `CAKEPHP`, quando necessario;
   - fazer `POST /lojas/loja_selecionada/{storeId}`;
   - fazer `GET /ofertas` com os cookies da mesma sessao;
   - validar que o HTML renderizado corresponde a cidade esperada quando possivel;
   - parsear `.oferta`.
7. Para cada `.oferta`:
   - ler titulo em `.titulo_oferta`;
   - extrair datas de validade do texto, quando no formato `validas de DD/MM/YYYY ate DD/MM/YYYY`;
   - agrupar links por `data-fancybox`;
   - normalizar URLs relativas para absolutas;
   - remover duplicatas mantendo ordem;
   - considerar o primeiro link como capa.
8. Persistir cada encarte como `image-gallery` usando o storage compartilhado de galerias de imagens.
9. Retornar falhas por loja sem derrubar a extracao inteira.

### Parsing Seguro Das Variaveis JS

Nao usar regex solta para montar objetos de dominio diretamente. A regex pode localizar o trecho, mas a transformacao deve validar a forma.

Abordagem recomendada:

1. Localizar `var lojas = ...;` e `var cidades_list = ...;`.
2. Extrair o literal JSON entre `=` e `;`.
3. Usar `JSON.parse` porque os exemplos observados ja sao JSON valido.
4. Validar item por item com funcoes tipadas, sem `any` e sem `unknown` em tipos publicos do projeto.

Se for necessario receber valor externo de `JSON.parse`, manter o valor dentro da funcao de infraestrutura e validar por guardas antes de retornar tipos do projeto.

### Limites Do Fluxo API-like

Este fluxo nao gera dataset visual. Ele resolve a producao em escala, mas nao substitui Playwright para pesquisa.

Deve cair para Playwright quando:

- nao conseguir descobrir cidades/lojas;
- o POST de selecao nao gravar cookie ou falhar;
- `/ofertas` nao renderizar `.oferta`;
- a estrutura `.oferta` mudar;
- o usuario habilitar dataset visual.

## Fluxo Playwright

Este fluxo deve ser usado quando `visualDatasetEnabled=true` e como fallback da camada API-like.

Interface sugerida:

```ts
export interface BistekLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  discoverStores(): Promise<readonly BistekMonitoredStore[]>;
  openStoreSelectionModal(): Promise<void>;
  getCitySelectionVisualTarget(store: BistekMonitoredStore): Promise<BistekLeafletVisualTarget>;
  selectCity(store: BistekMonitoredStore): Promise<void>;
  getStoreSelectionVisualTarget(store: BistekMonitoredStore): Promise<BistekLeafletVisualTarget>;
  selectStore(store: BistekMonitoredStore): Promise<void>;
  waitForStoreLeaflets(store: BistekMonitoredStore): Promise<void>;
  discoverCards(): Promise<readonly BistekLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<BistekLeafletVisualTarget>;
  openLeafletAt(cardIndex: number): Promise<void>;
  getActiveLeafletImageVisualTarget(imageIndex: number): Promise<BistekLeafletVisualTarget>;
  resolveActiveDownloadImageUrl(): Promise<string>;
  resolveLeafletImageUrls(cardIndex: number): Promise<readonly string[]>;
  getNextGalleryImageVisualTarget(): Promise<BistekLeafletVisualTarget>;
  goToNextGalleryImage(): Promise<void>;
  getModalCloseVisualTarget(): Promise<BistekLeafletVisualTarget>;
  closeLeafletModal(): Promise<void>;
  close(): Promise<void>;
}
```

O primeiro corte pode baixar as imagens a partir dos `href` de `a[data-fancybox]` descobertos no HTML depois que a loja estiver selecionada. O fluxo visual ainda deve abrir pelo menos cada encarte para capturar a acao humana de abrir modal e, se o dataset estiver habilitado, capturar a imagem/controle antes da extracao.

## FSM Visual Do Bistek

FSM recomendada:

```text
ANCHOR_PAGE
  Modal de selecao de loja aparece ou e aberto por "Encontre sua loja".

CITY_SELECTION
  Usuario seleciona a cidade em #cidades_list.

STORE_SELECTION
  Usuario seleciona a loja em #lojas_list.

LEAFLETS_PAGE
  Pagina /ofertas renderiza os cards .oferta da cidade/loja.

LEAFLET_MODAL
  Usuario abre um encarte via capa ou card.

IMAGE_GALLERY
  Fancybox exibe a pagina do encarte e controles de download/navegacao.
```

Transicoes e labels:

```text
ANCHOR_PAGE -> CITY_SELECTION
  alvo: #cidades_list ou opcao de cidade
  label: select_city_button

CITY_SELECTION -> STORE_SELECTION
  alvo: #lojas_list ou opcao de loja
  label: select_store_button

LEAFLETS_PAGE -> LEAFLET_MODAL
  alvo: card/capa do encarte
  label: open_leaflet_modal_button

LEAFLET_MODAL -> IMAGE_GALLERY/extracao
  alvo: imagem ativa ou botao download
  label: extract_leaflet_image ou download_image_button

IMAGE_GALLERY -> IMAGE_GALLERY
  alvo: proximo/anterior no Fancybox, se o scraper navegar visualmente
  label: next_gallery_image_button ou previous_gallery_image_button

IMAGE_GALLERY -> LEAFLETS_PAGE
  alvo: botao fechar
  label: close_modal_button
```

## Protocolo Visual Obrigatorio

Antes de cada acao Playwright que muda estado:

1. Aguardar estabilidade suficiente.
2. Localizar o alvo com locator robusto.
3. Validar visibilidade e disponibilidade.
4. Extrair bounding box.
5. Capturar scroll, viewport e dimensoes do documento.
6. Mapear coordenadas via mapper existente.
7. Capturar screenshot full-page.
8. Criar `VisualDatasetSample`.
9. Persistir/enfileirar a amostra.
10. Executar a acao.

Nao capturar depois do clique como se fosse antes. Para dataset, a coordenada precisa descrever o alvo antes da acao.

## Locators Recomendados

Seletores aceitaveis para este site, porque o HTML tem poucos atributos semanticos:

```text
#select_lojas
#cidades_list
#lojas_list
.localiza
.oferta
.titulo_oferta
.capa_oferta a[data-fancybox]
.oferta_paginas a[data-fancybox]
.fancybox-button--download
.fancybox-button--close
.fancybox-button--arrow_right
.fancybox-button--arrow_left
```

Sempre encapsular seletores CSS em metodos com nomes semanticos, por exemplo:

```ts
private citySelectLocator(): Locator
private storeSelectLocator(): Locator
private leafletCardLocator(cardIndex: number): Locator
private fancyboxDownloadButtonLocator(): Locator
```

Nao espalhar seletores CSS diretamente no extractor.

Fallback para abrir o modal de loja:

```text
page.getByText(/Encontre sua loja/i)
```

ou `.localiza` encapsulado.

## Estrategia Hibrida

Criar `BistekHybridStrategy` com comportamento claro:

```text
Se visualDatasetEnabled=true:
  usar Playwright.

Se visualDatasetEnabled=false:
  tentar API-like.
  se API-like falhar em descoberta, selecao ou parsing:
    usar Playwright.
```

Nao esconder falhas. O resultado deve registrar:

- lojas extraidas;
- lojas sem encartes;
- lojas com falha;
- motivo de fallback;
- modo que teve sucesso (`api-like` ou `playwright`).

O modo API-like nao deve retornar sucesso parcial silencioso quando uma loja falha. Ele pode retornar sucesso com `failedStores`, desde que o adapter/use case registre o resultado e nao perca a falha.

## Armazenamento

Usar storage existente para galerias de imagens, provavelmente `SharedImageGalleryStorage` ou equivalente ja existente no projeto.

Payload de negocio esperado:

```text
supermarketId=bistek
supermarketName=Bistek
fileFormat=image-gallery
sourcePageUrl=https://institucional.bistek.com.br/ofertas
artifactUrl=coverImageUrl ou URL representativa da galeria
storageKey=chave retornada pelo storage
metadata.metadataKind=bistek
```

O storage deve baixar cada imagem `.jpg` e persistir a galeria com ordem estavel.

Deduplicacao:

- deduplicar por `storeId + ofertaId + imageUrls`;
- se o mesmo encarte aparece em varias lojas, manter metadata por loja, mas evitar downloads duplicados se o storage ja tiver hash/URL igual;
- nao remover a relacao loja -> encarte.

## Testes

Testes minimos por camada:

```text
bistek-targets.test.ts
  parseia cidades e lojas do HTML fixture.
  rejeita cidades sem UF/cidade.
  rejeita lojas sem id/cidade/nome.
  transforma coordenadas 0.00000000 em null.

bistek-api-extraction.test.ts
  faz GET inicial.
  extrai lojas dinamicamente.
  faz POST /lojas/loja_selecionada/{storeId}.
  faz GET /ofertas com cookies.
  parseia .oferta e links a[data-fancybox].
  extrai datas de validade.
  deduplica imagens mantendo ordem.
  registra failedStores quando uma loja falha.

bistek-hybrid-strategy.test.ts
  usa API-like quando dataset visual esta desabilitado.
  usa Playwright quando dataset visual esta habilitado.
  cai para Playwright quando API-like falha.
  preserva erro se API-like e Playwright falharem.

bistek-leaflet-extractor.test.ts
  captura cidade antes de selecionar.
  captura loja antes de selecionar.
  captura card antes de abrir.
  captura imagem/download antes de extrair.
  fecha modal antes do proximo card.
  suporta loja sem encartes.
  falha com erro tipado quando bounding box nao existe.
```

Fixture HTML:

- salvar uma fixture pequena com `var cidades_list`, `var lojas` e dois blocos `.oferta`;
- incluir pelo menos uma galeria com varias paginas;
- incluir titulo com validade;
- incluir titulo sem validade para cobrir `null`.

Nao depender do site real em unit tests. Real-browser deve ser smoke/integracao seletiva.

## Branches Sugeridas Para Stack

Antes de abrir stack, ler `docs/gh-stack-workflow.md`.

Stack sugerido:

```text
feat/bistek-domain-contracts
feat/bistek-api-extraction
feat/bistek-playwright-flow
feat/bistek-hybrid-strategy
feat/bistek-worker-wiring
```

Commits devem seguir Conventional Commits com escopo:

```text
feat(bistek-domain): add Bistek metadata and dataset subjects
feat(bistek-api): extract stores and image galleries through HTTP
feat(bistek-playwright): add visual FSM for city and store selection
feat(bistek-extraction): add hybrid Bistek strategy
test(bistek-extraction): cover fallback and gallery parsing
```

## Comandos De Validacao

Usar Node 24:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
```

Durante desenvolvimento:

```bash
npm run typecheck
npm run typecheck:test
npm run lint
npm run test -- bistek
```

Antes de declarar pronto:

```bash
npm run verify
```

Nao declarar a stack pronta se `npm run verify` falhar.

## Smoke Manual Recomendado

Comandos HTTP uteis para revalidar o comportamento do site:

```bash
tmp=$(mktemp)
curl -s -c "$tmp" -L https://institucional.bistek.com.br/ofertas >/dev/null
curl -s -b "$tmp" -c "$tmp" -X POST https://institucional.bistek.com.br/lojas/loja_selecionada/2 -D -
curl -s -b "$tmp" -L https://institucional.bistek.com.br/ofertas | rg -n "Confira as ofertas de|data-fancybox|titulo_oferta"
rm -f "$tmp"
```

Resultado esperado para loja `2`, se o site mantiver o comportamento observado:

```text
Set-Cookie: bistek[loja_selecionada]=2
Confira as ofertas de Blumenau
a[data-fancybox] com hrefs .jpg
```

Smoke Playwright util:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
node --input-type=module <<'NODE'
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto('https://institucional.bistek.com.br/ofertas', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
console.log('modal', await page.locator('#select_lojas').isVisible().catch(() => false));
await page.selectOption('#cidades_list', '4348');
await page.waitForTimeout(500);
console.log(await page.locator('#lojas_list option').evaluateAll((options) => options.map((option) => option.textContent?.trim())));
await page.selectOption('#lojas_list', '2');
await page.waitForTimeout(2000);
console.log(await page.getByText(/Confira as ofertas de/i).first().textContent());
console.log(await page.locator('.oferta').count());
await browser.close();
NODE
```

## Riscos Conhecidos

- O site usa PHP/CakePHP antigo e estado em cookie; sessao/cookies podem afetar resultados se um contexto for reutilizado incorretamente.
- O endpoint de selecao retorna corpo vazio; sucesso deve ser inferido por status/cookie e pelo HTML seguinte.
- As mesmas ofertas podem aparecer em varias lojas, principalmente por UF/cidade. A deduplicacao nao deve apagar metadata por loja.
- As imagens sao servidas por URLs codificadas em `/image/...jpg`; baixar essas URLs diretamente e aceitavel, mas normalizar para URL absoluta.
- O texto de validade contem acentos e pode variar. O parser deve retornar `null` quando nao reconhecer, em vez de inventar datas.
- O botao de download do Fancybox baixa apenas a pagina atual, nao o encarte inteiro. Para uma galeria, baixar todos os `hrefs` do mesmo `data-fancybox`.
- Se o site mudar para PDF no futuro, adicionar suporte por formato detectado, sem assumir que todo Bistek sera sempre imagem.

## Definition Of Done Para Bistek

O scraper Bistek so deve ser considerado completo quando:

- descobrir cidades e lojas dinamicamente;
- extrair todas as lojas de todas as cidades;
- baixar todos os encartes de cada loja como `image-gallery`;
- persistir metadata tipada `BistekLeafletMetadata`;
- registrar lojas com falha sem interromper todas as demais;
- implementar fallback Playwright;
- capturar dataset visual antes de cidade, loja, card e imagem/download quando Playwright for usado;
- validar bounding boxes e coordenadas via servico existente;
- ter testes unitarios de parsing, mapeamento e fallback;
- ter testes do fluxo Playwright com pagina fake/mocks;
- estar ligado ao worker sem colocar loops infinitos dentro da estrategia;
- passar `npm run verify` no topo da stack.
