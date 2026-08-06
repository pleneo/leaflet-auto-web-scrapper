# Web Scraper Agent Guidelines

## 1. Purpose Of This Repository

This repository is not merely a supermarket leaflet scraper. It is the foundation of a dual-purpose system that combines a real business extraction pipeline with a visual dataset research pipeline in Artificial Intelligence.

The business problem is practical: supermarket websites publish promotional leaflets as PDFs, image galleries, modals, links, or dynamic pages. The system must navigate those websites, find the current leaflet, extract the downloadable artifact, and persist the result.

The research problem is deeper: conventional web scrapers break when the DOM structure changes. This is a form of structural concept drift. The long-term research goal is to build a dataset and an inference pipeline capable of recovering from those failures through visual and semantic understanding instead of brittle HTML selectors.

The project therefore has two inseparable tracks:

- Track A, Production Extraction: a deterministic Playwright-based automation pipeline that navigates websites and extracts supermarket leaflets.
- Track B, Visual Dataset Generation: an embedded auto-annotation pipeline that captures full-page screenshots and exact target-element coordinates during successful Track A executions.

A scraper that downloads a leaflet but does not generate visual annotations is incomplete. A scraper that generates annotations but does not solve the real extraction task is also incomplete. Both tracks must evolve together.

## 2. Research Motivation

The project should be treated as a possible research specialization axis in AI applied to web automation. Its strongest research value is not "scraping supermarket leaflets"; it is the systematic generation of training data for models that can locate actionable web elements visually.

The intended research direction is:

1. Use deterministic browser automation as a reliable teacher.
2. Capture the visual state of each navigation step.
3. Record the exact bounding box of the next meaningful target element.
4. Label that target with a semantic action name.
5. Use the resulting dataset to train or evaluate visual models.
6. Use trained models as fallback when DOM-based extraction fails.

Possible future model families include Vision-Language Models, object detectors, layout-aware models, or lightweight detectors trained on screenshot and bounding-box pairs.

This repository must preserve the scientific usefulness of the collected data. Dataset quality is not a secondary concern; it is part of the core product.

## 3. Current Repository State And Target Direction

At the time of writing, the repository may still contain a frontend scaffold, such as Vite, React, and static assets. That scaffold must not define the architectural center of the project.

The target system is an extraction worker written in TypeScript, preferably organized with NestJS for dependency injection, modularity, testability, and long-term maintainability.

If a frontend is kept or added later, it should be treated as an operator dashboard, dataset inspection tool, or execution monitor. It must not contain scraping logic, domain rules, Playwright orchestration, storage policies, or dataset annotation logic.

## 4. Mandatory Technology Choices

Use these technologies for the extraction engine:

- Language: TypeScript.
- Runtime: Node.js.
- Browser automation: Playwright.
- Application architecture: NestJS or a clean TypeScript modular equivalent until NestJS is introduced.
- Testing: the repository's TypeScript test stack, extended as needed.
- Storage: repository ports in the application/domain layers, concrete implementations in infrastructure.

These tools are forbidden for browser automation in this project:

- Selenium.
- Puppeteer.
- Ad hoc browser-control wrappers that hide or weaken Playwright's locator, screenshot, and bounding-box APIs.

Playwright is mandatory because the project depends on reliable browser automation, strict locators, full-page screenshots, network control, and native element geometry extraction.

## 5. Architectural Principle

The codebase must follow Clean Architecture.

The dependency direction must be:

```text
infrastructure -> application -> domain
```

The domain layer must not import Playwright, NestJS, filesystem APIs, database clients, HTTP clients, or framework-specific types.

The application layer coordinates use cases and ports. It may depend on domain contracts, but it must not know browser-specific details.

The infrastructure layer implements browser automation, repositories, file storage, network policies, and adapters.

The user interface, if present, is outside the extraction core and should call application services through explicit interfaces.

## 6. Target Project Structure

The target structure should move toward this shape:

```text
src/
├── domain/
│   ├── entities/
│   │   ├── Leaflet.ts
│   │   ├── DatasetSample.ts
│   │   └── ExtractionRun.ts
│   ├── errors/
│   │   └── ExtractionFailure.ts
│   ├── interfaces/
│   │   ├── SupermarketStrategy.ts
│   │   ├── DatasetSampleRepository.ts
│   │   ├── LeafletRepository.ts
│   │   └── ArtifactStorage.ts
│   └── value-objects/
│       ├── BoundingBox.ts
│       ├── ScreenshotMetadata.ts
│       └── SemanticTargetLabel.ts
├── application/
│   ├── use-cases/
│   │   └── ExtractSupermarketLeafletUseCase.ts
│   ├── services/
│   │   ├── ScheduledExtractionRunner.ts
│   │   ├── ExtractionQueue.ts
│   │   ├── RetryPolicy.ts
│   │   └── DatasetCaptureService.ts
│   └── mappers/
│       ├── PlaywrightBoundingBoxMapper.ts
│       ├── LeafletMapper.ts
│       └── DatasetSampleMapper.ts
├── infrastructure/
│   ├── playwright/
│   │   ├── PlaywrightBrowserFactory.ts
│   │   ├── PlaywrightPagePolicy.ts
│   │   └── VisualStateCapture.ts
│   ├── scrapers/
│   │   ├── carnauba/
│   │   │   └── CarnaubaSupermarketStrategy.ts
│   │   └── assai/
│   │       └── AssaiSupermarketStrategy.ts
│   ├── repositories/
│   │   ├── FileSystemDatasetSampleRepository.ts
│   │   └── FileSystemLeafletRepository.ts
│   └── storage/
│       └── LocalArtifactStorage.ts
└── main.ts
```

This structure is a target, not an excuse for premature abstraction. Add modules as the implementation requires them, but do not collapse domain, application, and Playwright concerns into one script.

## 7. Runtime Architecture For 24/7 Execution

This project is intended to run continuously. It is not a one-shot script that a developer manually executes from a terminal when they need a leaflet.

The long-running lifecycle must be owned by a worker or scheduler layer:

```text
LongRunningExtractionWorker
  -> ScheduledExtractionRunner
    -> ExtractionQueue
      -> ExtractSupermarketLeafletUseCase.execute(...)
        -> StrategyRegistry
          -> SupermarketStrategy.execute(...)
        -> VisualStateCapture
        -> repositories/storage
```

The responsibility boundaries are strict:

- the worker decides when the system should run;
- the scheduler decides which supermarkets are due for extraction;
- the queue controls concurrency and prevents overlapping runs;
- the retry policy controls backoff and retry limits;
- the use case performs one extraction attempt for one supermarket;
- the strategy performs the site-specific navigation;
- the visual capture service performs the standardized screenshot and bounding-box protocol;
- repositories and storage persist business and visual dataset outputs.

`ExtractSupermarketLeafletUseCase.execute(...)` must represent one bounded attempt:

```text
"Try to extract the current leaflet for this supermarket now."
```

It must not contain an infinite loop. It must not sleep until the next cycle. It must not decide global scheduling.

`SupermarketStrategy.execute(...)` is even narrower:

```text
"Given a prepared browser page and extraction context, navigate this specific supermarket website and return the leaflet output plus dataset samples."
```

It must not own the worker lifecycle, retries, queue, global logger configuration, process shutdown, or cross-supermarket scheduling.

No strategy or use case may own the infinite execution loop. The 24/7 lifecycle belongs only to the worker/scheduler layer.

The worker/scheduler layer must handle:

- periodic execution;
- per-supermarket schedules;
- concurrency limits;
- preventing two active runs for the same supermarket;
- retry with bounded exponential backoff;
- run-level timeout;
- browser/page/context cleanup;
- deduplication of already-seen leaflet artifacts;
- persistence of run status;
- logs with `runId` and `supermarketId`;
- graceful shutdown on process signals;
- resilience so one failed supermarket does not stop the entire worker.

The system should be designed so that the same use case can be called by:

- the 24/7 worker;
- a CLI command;
- a dashboard action;
- a test harness;
- a future administrative API.

That is only possible if the use case is one-shot and side effects are expressed through explicit ports.

## 8. Core Domain Contracts

Contracts must be explicit. Do not use generic escape hatches. In particular, do not use `any` or `unknown` in project types.

Use explicit interfaces, discriminated unions, narrow string unions, and mapper functions. If a new supermarket needs extra metadata, add a typed metadata interface for that supermarket and include it in the metadata union.

Recommended domain contracts:

```ts
export type SupermarketId = 'carnauba' | 'assai' | 'sao-luiz' | 'generic-supermarket';

export type LeafletFileFormat = 'pdf' | 'single-image' | 'image-gallery';

export type DatasetSplit = 'train' | 'validation' | 'test' | 'unassigned';

export type ExtractionRunStatus = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type FsmStateName =
  | 'ANCHOR_PAGE'
  | 'STORE_SELECTION'
  | 'LEAFLETS_PAGE'
  | 'LEAFLET_MODAL'
  | 'PDF_DOWNLOAD'
  | 'IMAGE_GALLERY'
  | 'ERROR_RECOVERY';

export type TargetSemanticLabel =
  | 'open_leaflets_page_button'
  | 'open_leaflet_modal_button'
  | 'download_pdf_button'
  | 'open_pdf_link'
  | 'select_store_button'
  | 'select_region_button'
  | 'next_gallery_image_button'
  | 'previous_gallery_image_button'
  | 'close_modal_button';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface DocumentScrollPosition {
  scrollX: number;
  scrollY: number;
}

export interface PixelBoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
}

export interface NormalizedBoundingBox {
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
}

export interface VisualTargetAnnotation {
  label: TargetSemanticLabel;
  viewportBox: PixelBoundingBox;
  documentBox: PixelBoundingBox;
  normalizedDocumentBox: NormalizedBoundingBox;
}

export interface ScreenshotMetadata {
  fileName: string;
  mimeType: 'image/png';
  fullPage: true;
  viewport: ViewportSize;
  documentWidth: number;
  documentHeight: number;
  scrollPosition: DocumentScrollPosition;
  capturedAtIso: string;
}

export interface VisualDatasetSample {
  sampleId: string;
  runId: string;
  supermarketId: SupermarketId;
  stateName: FsmStateName;
  pageUrl: string;
  screenshotPng: Uint8Array;
  screenshotMetadata: ScreenshotMetadata;
  target: VisualTargetAnnotation;
  split: DatasetSplit;
}

export interface BaseLeafletMetadata {
  metadataKind: 'base';
  capturedAtIso: string;
  sourcePageUrl: string;
  validityStartDateIso: string | null;
  validityEndDateIso: string | null;
  city: string | null;
  stateCode: string | null;
}

export interface CarnaubaLeafletMetadata {
  metadataKind: 'carnauba';
  capturedAtIso: string;
  sourcePageUrl: string;
  validityStartDateIso: string | null;
  validityEndDateIso: string | null;
  city: string | null;
  stateCode: string | null;
  branchId: string;
  branchSlug: string;
}

export interface AssaiLeafletMetadata {
  metadataKind: 'assai';
  capturedAtIso: string;
  sourcePageUrl: string;
  validityStartDateIso: string | null;
  validityEndDateIso: string | null;
  city: string | null;
  stateCode: string | null;
  regionCode: string | null;
}

export type LeafletMetadata = BaseLeafletMetadata | CarnaubaLeafletMetadata | AssaiLeafletMetadata;

export interface PromotionLeaflet<TMetadata extends LeafletMetadata = LeafletMetadata> {
  leafletId: string;
  supermarketId: SupermarketId;
  supermarketName: string;
  fileFormat: LeafletFileFormat;
  sourcePageUrl: string;
  artifactUrl: string;
  storageKey: string;
  metadata: TMetadata;
}

export interface ExtractionInput {
  runId: string;
  supermarketId: SupermarketId;
  supermarketName: string;
  anchorUrl: string;
  startedAtIso: string;
}

export interface ScheduledExtractionTarget {
  supermarketId: SupermarketId;
  supermarketName: string;
  anchorUrl: string;
  enabled: boolean;
  intervalMinutes: number;
  maxAttempts: number;
}

export interface ExtractionRunSummary {
  runId: string;
  supermarketId: SupermarketId;
  status: ExtractionRunStatus;
  scheduledAtIso: string;
  startedAtIso: string | null;
  completedAtIso: string | null;
  attemptNumber: number;
  maxAttempts: number;
}

export interface ExtractionResult<TMetadata extends LeafletMetadata = LeafletMetadata> {
  runId: string;
  leaflet: PromotionLeaflet<TMetadata>;
  datasetSamples: VisualDatasetSample[];
  completedAtIso: string;
}

export interface StrategyExecutionContext {
  runId: string;
  supermarketId: SupermarketId;
  startedAtIso: string;
}

export interface StrategyExtractionOutput<TMetadata extends LeafletMetadata = LeafletMetadata> {
  leaflet: PromotionLeaflet<TMetadata>;
  datasetSamples: VisualDatasetSample[];
}

export interface SupermarketStrategy<TMetadata extends LeafletMetadata = LeafletMetadata> {
  execute(context: StrategyExecutionContext): Promise<StrategyExtractionOutput<TMetadata>>;
}
```

These contracts are examples of the expected level of specificity. If the implementation changes them, it must preserve the same principles:

- no loose metadata bags;
- no browser-framework types in domain contracts;
- no unlabeled bounding boxes;
- no screenshot without coordinate metadata;
- no extraction result without business and visual dataset payloads.
- no infinite worker lifecycle inside a strategy or one-shot use case.

If infrastructure needs a richer strategy context containing a Playwright `Page`, visual capture adapter, logger, or browser context, that richer type must live outside the domain layer. Domain contracts may define the business shape, but Playwright-specific objects must remain in infrastructure/application boundaries.

## 9. Visual Finite State Machine Requirement

Every concrete supermarket scraper must be modeled as a Visual Finite State Machine.

Each state represents a meaningful visual page condition, not merely a code branch. Examples:

- anchor page loaded;
- store selector opened;
- target branch selected;
- leaflets page visible;
- leaflet modal opened;
- PDF download button visible;
- image gallery visible.

The scraper must start from an anchor URL. Do not hardcode unstable deep links such as campaign-specific leaflet pages unless the supermarket officially exposes them as stable entry points.

The scraper should behave like a human user:

1. Enter through the anchor page.
2. Find the visible action that leads to leaflets.
3. Click through modals, selectors, tabs, or galleries.
4. Extract the final PDF or image artifact.
5. Capture a dataset sample before each action that changes state.

Do not reduce the FSM to a single final selector. The intermediate states are valuable research data.

## 10. Mandatory Atomic Step Protocol

For every state transition, the scraper must follow this order:

1. Wait until the page is stable enough for interaction.
2. Locate the target element using robust Playwright locators.
3. Verify that the target is visible, enabled, and semantically correct.
4. Extract the Playwright bounding box.
5. Capture scroll position, viewport size, and document dimensions.
6. Convert the raw Playwright geometry into viewport, document, and normalized coordinate spaces.
7. Capture a full-page PNG screenshot.
8. Build a `VisualDatasetSample`.
9. Persist or enqueue the dataset sample.
10. Execute the action, such as click, navigation, download, or href extraction.

This order is mandatory because the screenshot and coordinates must describe the page state before the action is taken.

If the bounding box is null, zero-sized, outside the document, or inconsistent with the screenshot dimensions, the scraper must not silently continue. It must either recover through a defined fallback or fail with a typed extraction error.

## 11. Coordinate System Rules

The project must treat coordinates with scientific care.

Playwright's `locator.boundingBox()` returns geometry that must be mapped into the coordinate system used by the saved screenshot. Full-page screenshots and viewport-relative boxes are not automatically the same coordinate space.

Every dataset sample must store:

- the raw viewport-relative box;
- the document-relative box used for annotation;
- the normalized document box used by detector training pipelines;
- viewport size;
- document width and height;
- scroll position;
- full-page screenshot dimensions.

Before persisting a sample, validate that:

- `xMin < xMax`;
- `yMin < yMax`;
- `width > 0`;
- `height > 0`;
- the document box fits inside the screenshot dimensions;
- normalized values are between `0` and `1`;
- the semantic label belongs to the approved label taxonomy.

Do not export raw Playwright geometry directly as the final annotation. It must pass through a mapper.

## 12. Semantic Labeling Rules

Labels are part of the visual dataset contribution. They must describe the user's intended action, not the implementation detail of the website.

Good labels:

- `open_leaflets_page_button`
- `download_pdf_button`
- `select_store_button`
- `open_leaflet_modal_button`

Bad labels:

- `button_1`
- `green_button`
- `div_promocoes`
- `xpath_target`
- `carnauba_specific_header_link`

When a new action type appears, add it to `TargetSemanticLabel` deliberately. Do not invent labels inline inside scrapers.

## 13. Locator Strategy

Prefer locators that reflect user-visible semantics:

- `page.getByRole(...)`;
- `page.getByText(...)` with strict and intentional matching;
- `page.getByLabel(...)`;
- `page.getByAltText(...)`;
- accessible names;
- stable test IDs only if the target website actually provides them.

CSS selectors are acceptable only when semantic locators are not sufficient. They must be wrapped in a local method with a meaningful name and a fallback strategy.

Raw XPath is strongly discouraged. If XPath is unavoidable, it must be isolated, documented, and backed by at least one fallback locator.

Do not use selectors that depend on fragile layout positions such as deeply nested `nth-child` chains unless there is no reasonable alternative and the risk is documented.

## 14. Network And Performance Policy

The scraper should use Playwright request interception to reduce unnecessary bandwidth and memory usage.

Block obvious non-essential resources when safe:

- ads;
- analytics;
- trackers;
- social widgets;
- unrelated video;
- third-party fonts when not needed for layout stability.

Be careful with image blocking. Leaflets may be image-based, thumbnails may be required to identify the correct target, and visual layout must remain faithful for dataset generation.

Do not block resources in a way that changes the page's visual state enough to corrupt screenshots or target coordinates.

## 15. Error Handling And Recovery

Network requests fail. DOM nodes disappear. Modals animate. Cookie banners appear. Supermarket websites change without notice.

Scrapers must use explicit error categories.

Recommended error codes:

```ts
export type ExtractionErrorCode =
  | 'ANCHOR_NAVIGATION_FAILED'
  | 'TARGET_LOCATOR_NOT_FOUND'
  | 'TARGET_NOT_VISIBLE'
  | 'TARGET_NOT_ENABLED'
  | 'BOUNDING_BOX_NOT_AVAILABLE'
  | 'BOUNDING_BOX_INVALID'
  | 'SCREENSHOT_CAPTURE_FAILED'
  | 'DATASET_SAMPLE_PERSISTENCE_FAILED'
  | 'LEAFLET_ARTIFACT_NOT_FOUND'
  | 'LEAFLET_DOWNLOAD_FAILED'
  | 'STATE_TRANSITION_FAILED'
  | 'UNSUPPORTED_PAGE_VARIANT';

export interface ExtractionErrorContext {
  runId: string;
  supermarketId: SupermarketId;
  stateName: FsmStateName;
  pageUrl: string;
  locatorDescription: string | null;
  message: string;
}
```

Recovery is encouraged, but silent failure is forbidden. If a scraper uses fallback locators or alternate flows, that decision must be visible in logs and tests.

## 16. Mapper Requirement

Infrastructure data must not cross into application or domain layers directly.

Mandatory mappers include:

- Playwright bounding box to domain visual annotation.
- Playwright screenshot metadata to domain screenshot metadata.
- scraper-specific extracted leaflet data to domain leaflet entity.
- storage persistence result to domain storage reference.

The mapper layer is especially important for dataset correctness. It is where coordinate conversion, normalization, date parsing, URL canonicalization, and metadata validation should happen.

Do not return raw Playwright `Locator`, `Page`, `Download`, `Response`, or browser context objects from application or domain services.

## 17. Storage Responsibilities

The project must keep business artifacts and visual dataset artifacts logically separate.

Business payload:

- supermarket name;
- supermarket identifier;
- source page URL;
- final artifact URL;
- downloaded PDF or image files;
- typed leaflet metadata.

Visual dataset payload:

- full-page PNG screenshot;
- bounding-box annotation;
- semantic label;
- FSM state name;
- run identifier;
- page URL at capture time;
- viewport and document dimensions;
- dataset split;
- capture timestamp.

A failed business extraction may still produce useful visual dataset failure data, but that should be handled by an explicit failure-data policy. Do not mix failed samples into training data without labeling or review.

## 18. Definition Of Done For A New Supermarket Strategy

A new supermarket scraper is not complete until it satisfies all of the following:

- starts from a stable anchor URL;
- implements a clear FSM;
- captures one dataset sample before every meaningful state transition;
- extracts and validates bounding boxes;
- captures full-page screenshots;
- maps all infrastructure data into domain entities;
- downloads or resolves the current leaflet artifact;
- persists business and visual dataset payloads through repository interfaces;
- uses typed metadata without loose fields;
- logs state transitions and fallback paths;
- does not implement its own infinite loop, scheduler, retry policy, or queue;
- has unit tests for mappers and state logic;
- has at least one integration or fixture-based test for the main extraction flow;
- documents known website variants, limitations, and fallback behavior.

If a site requires manual handling, authentication, CAPTCHA solving, or unavailable geolocation, the scraper must report that limitation explicitly.

## 19. Testing Strategy

Testing must match the risk profile of the project.

Mapper tests are mandatory because coordinate conversion errors silently corrupt the dataset.

Strategy tests should cover:

- successful navigation;
- missing target element;
- invisible target element;
- null bounding box;
- changed modal flow;
- unsupported page variant;
- artifact URL extraction;
- dataset sample creation.

Use fixture HTML and mocked Playwright adapters when possible. Use real-browser tests selectively for end-to-end validation because public websites are unstable and may make CI flaky.

When real websites are tested, record:

- date and time;
- target supermarket;
- anchor URL;
- observed final artifact URL;
- screenshots or logs needed for debugging.

## 20. Logging And Observability

Every extraction run must have a `runId`.

Logs should make the FSM trace understandable:

- run started;
- anchor URL loaded;
- state entered;
- target locator selected;
- bounding box extracted;
- screenshot captured;
- dataset sample persisted;
- action executed;
- artifact found;
- run completed or failed.

Logs must not include sensitive credentials, private tokens, or large binary payloads.

## 21. Code Quality Rules

Required:

- strict TypeScript;
- explicit return types on public functions;
- small functions with single responsibility;
- meaningful names;
- immutable data where practical;
- domain-first naming;
- typed errors;
- dependency injection for infrastructure;
- conventional commits.

Forbidden:

- `any`;
- `unknown`;
- untyped metadata dictionaries;
- raw Playwright objects outside infrastructure boundaries;
- Selenium;
- Puppeteer;
- scraper-only scripts that bypass the application layer;
- hardcoded campaign deep links as the only extraction path;
- skipping screenshots;
- skipping bounding boxes;
- saving screenshots without labels;
- saving labels without screenshots;
- saving coordinates without validating coordinate space;
- treating visual dataset collection as optional.

## 22. Commit Convention

Use Conventional Commits:

Every commit must include a non-empty scope that identifies the module being changed:

```text
type(module): subject
```

Use concise kebab-case scopes such as `architecture`, `carnauba-extraction`, `leaflet-domain`, `dataset-capture`, `config`, `tests`, or `tooling`.

- `feat(module):` for new extraction functionality;
- `fix(module):` for bug fixes;
- `refactor(module):` for internal restructuring without behavior change;
- `test(module):` for tests;
- `docs(module):` for documentation;
- `chore(module):` for tooling and maintenance.

Examples:

```text
feat(carnauba-extraction): add visual fsm for leaflet extraction
fix(dataset-capture): normalize full-page screenshot bounding boxes
test(coordinate-mapper): cover invalid bounding box mapper cases
docs(agents): clarify dataset annotation protocol
```

## 23. Branch And Pull Request Workflow

Feature development must use stacked pull requests through `gh stack`.

Do not work directly on `main` for feature work. Break macro features into small stacked branches that can be reviewed from bottom to top. Prefer branches with one clear purpose and roughly 300 changed lines or fewer.

PR titles and descriptions must be written in English and follow the standard documented in the stack workflow guide.

Before creating or updating a stack, read [docs/gh-stack-workflow.md](docs/gh-stack-workflow.md).

At the end of every stack, the final top branch must pass the complete local quality gate:

```bash
npm run verify
```

This is mandatory after all rebases, conflict resolutions, fixup commits, and stack pushes. Running `typecheck`, `lint`, `test:coverage`, `build`, or targeted Prettier checks separately is useful during development, but it is not enough to declare a stack ready. The final readiness signal is always a successful `npm run verify` from the stack's top branch.

If `npm run verify` fails because of unrelated local files, generated artifacts, untracked documentation, or dirty worktree state, the agent must not ignore or bypass the failure. It must either:

- fix or format the relevant files when they belong to the intended change;
- keep unrelated files unstaged and explain why they block local verification;
- temporarily move or otherwise isolate unrelated local-only artifacts only when doing so does not delete user work;
- rerun `npm run verify` successfully before saying the stack is ready.

No PR in the stack should be presented as ready for review or merge while the top branch fails `npm run verify`.

## 24. Agent Instructions

When an AI coding agent works in this repository, it must follow these rules:

1. Read this file before making architectural decisions.
2. Inspect the existing code before proposing changes.
3. Preserve the dual-track purpose of the project.
4. Avoid implementing a quick scraper that undermines dataset quality.
5. Keep Playwright code inside infrastructure.
6. Keep domain contracts free from framework dependencies.
7. Add mappers whenever data crosses architectural boundaries.
8. Treat screenshots, bounding boxes, and semantic labels as mandatory.
9. Prefer robust user-facing locators over structural selectors.
10. Add tests for coordinate conversion and extraction edge cases.
11. Do not introduce loose types.
12. Do not replace the research architecture with a one-off automation script.
13. Keep 24/7 scheduling, retries, queues, and shutdown behavior outside supermarket strategies.
14. Use the documented `gh stack` workflow for feature branches and PRs.
15. After resolving stack conflicts or rebasing branches, run `npm run verify` on the final top branch before reporting completion.

If a user request conflicts with these rules, explain the conflict and propose the smallest alternative that preserves the project's research and production value.

## 25. Strategic Standard

The project should be engineered as if it may become both:

- a production extraction service used by a real business;
- a research artifact supporting a serious AI/Computer Science research path.

That means the implementation must be robust, typed, observable, testable, and scientifically useful.

The central standard is simple:

```text
Every successful navigation step should teach the future model what a human-relevant target looked like, where it was, and what action it represented.
```

## 26. Running The Project

This project must run on Node 24. Node version selection should be handled through `nvm`.

Agents and local automation must assume that `nvm` is installed under the user's `HOME` directory, usually at `$HOME/.nvm`. Non-interactive shells may not load `nvm` automatically, so load it explicitly before running Node or npm commands:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

Before running project commands, select the expected Node version:

```bash
nvm use 24
```

If dependencies are not installed yet, install them with the package manager used by the repository:

```bash
npm install
```

Common commands:

```bash
npm run dev
npm run build
npm run lint
npm run format:check
npm run test
npm run test:coverage
npm run verify
```

The meaning of each command must remain clear:

- `npm run dev`: starts the local development process.
- `npm run build`: typechecks and builds the project.
- `npm run lint`: checks code-quality and architecture rules.
- `npm run format:check`: verifies Prettier formatting, including mandatory semicolons.
- `npm run test`: runs the automated test suite.
- `npm run test:coverage`: runs the test suite with coverage reporting.
- `npm run verify`: runs the complete quality gate expected before commits and before a stack is considered ready, including build.

No feature should be committed if `npm run verify` fails. No stack should be reported as ready if `npm run verify` fails on its final top branch. If build, lint, formatting, tests, or coverage fail, fix the failure before committing or before reporting the stack as complete.

## 27. Test Coverage

Vitest is the official test runner for this project. Test configuration, scripts, examples, and documentation must treat Vitest as the standard testing tool.

The test suite is not optional. Every feature, bug fix, mapper, strategy, scheduler behavior, repository implementation, and domain rule must include automated tests.

The project target is 100% meaningful test coverage for:

- statements;
- branches;
- functions;
- lines.

Coverage must not be achieved through superficial assertions. Tests must verify behavior, edge cases, error handling, and architectural contracts.

Required test categories:

- Unit tests for domain value objects, entities, error types, and pure validation functions.
- Unit tests for application services such as `StrategyRegistry`, `RetryPolicy`, `ExtractionQueue`, and use cases.
- Mapper tests for coordinate conversion, screenshot metadata, leaflet metadata, and persistence DTOs.
- Infrastructure tests using mocks or fixtures for filesystem storage, logging, configuration loading, and Playwright adapters.
- Strategy tests using fixture HTML and mocked Playwright boundaries whenever possible.
- Selective real-browser integration tests for critical flows, kept separate from fast unit tests to avoid unstable CI runs.

Mandatory test cases include:

- valid bounding box conversion;
- invalid bounding box rejection;
- viewport-to-document coordinate mapping;
- normalized coordinate generation;
- null or unavailable target bounding box;
- missing target locator;
- invisible or disabled target element;
- unsupported page variant;
- strategy registry lookup success and failure;
- retry exhaustion;
- scheduler skipping disabled supermarkets;
- queue preventing concurrent runs for the same supermarket;
- leaflet artifact deduplication;
- dataset sample persistence failure;
- extraction run failure logging.

Test files should be named consistently:

```text
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
```

Recommended Vitest patterns:

```ts
import { describe, expect, it } from 'vitest';

describe('StrategyRegistry', () => {
  it('returns the strategy registered for a supermarket id', () => {
    const registry = new StrategyRegistry([carnaubaStrategy]);

    const strategy = registry.get('carnauba');

    expect(strategy.supermarketId).toBe('carnauba');
  });
});
```

Use Vitest features deliberately:

- `vi.fn()` for mocks and spies;
- `vi.spyOn(...)` when observing calls on real collaborators;
- `vi.useFakeTimers()` for scheduler, retry, and backoff logic;
- `beforeEach(...)` for deterministic setup;
- fixtures for HTML, screenshots, and sample payloads;
- typed test factories instead of loose objects.

Tests must follow the same TypeScript rules as production code. Do not use `any`, `unknown`, untyped metadata bags, or raw Playwright objects outside the proper boundary in tests.

Real public supermarket websites must not be required for the default test suite. Default tests must be deterministic. If a test needs a real browser or a real website, it must be explicitly separated, documented, and safe to skip in unstable environments.

Before committing, the complete quality gate must pass:

```bash
npm run verify
```
