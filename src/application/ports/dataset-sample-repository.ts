import type { VisualDatasetSample } from '../../domain/dataset/visual-dataset-sample';

export interface DatasetSampleRepository {
  saveMany(samples: readonly VisualDatasetSample[]): Promise<void>;
}
