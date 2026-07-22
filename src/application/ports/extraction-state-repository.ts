import type { ExtractionStateSnapshot } from '../../domain/extraction/extraction-state';

export interface ExtractionStateRepository {
  load(): Promise<ExtractionStateSnapshot>;
  save(snapshot: ExtractionStateSnapshot): Promise<void>;
}
