import type { ExtractionMode } from '../../domain/extraction/extraction-target';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type {
  PlaywrightExtractionFailure,
  PlaywrightExtractionInput,
  PlaywrightExtractionLeafletOutput,
  PlaywrightExtractionOutput,
  PlaywrightExtractionUnitOutput,
} from './playwright-extraction-strategy';

export type ExtractionStrategyInput = PlaywrightExtractionInput;

export type ExtractionStrategyOutput = PlaywrightExtractionOutput;

export type ExtractionStrategyUnitOutput = PlaywrightExtractionUnitOutput;

export type ExtractionStrategyLeafletOutput = PlaywrightExtractionLeafletOutput;

export type ExtractionStrategyFailure = PlaywrightExtractionFailure;

export interface ExtractionStrategy {
  readonly supermarketId: SupermarketId;
  readonly mode: ExtractionMode;
  execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput>;
}
