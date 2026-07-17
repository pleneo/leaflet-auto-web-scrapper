import type { ExtractionRunSummary } from '../../domain/extraction/extraction-run';

export interface ExtractionRunRepository {
  save(run: ExtractionRunSummary): Promise<void>;
}
