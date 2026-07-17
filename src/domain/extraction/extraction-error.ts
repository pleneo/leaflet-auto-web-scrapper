import type { FsmStateName } from './fsm-state-name';
import type { SupermarketId } from '../supermarket/supermarket-id';

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
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly stateName: FsmStateName;
  readonly pageUrl: string;
  readonly locatorDescription: string | null;
  readonly message: string;
}

export class ExtractionFailure extends Error {
  readonly code: ExtractionErrorCode;

  readonly context: ExtractionErrorContext;

  constructor(code: ExtractionErrorCode, context: ExtractionErrorContext) {
    super(context.message);
    this.name = 'ExtractionFailure';
    this.code = code;
    this.context = context;
  }
}
