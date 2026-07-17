import type { AcademicDatasetSample } from '../../domain/dataset/academic-dataset-sample';

export interface DatasetSampleRepository {
  saveMany(samples: readonly AcademicDatasetSample[]): Promise<void>;
}
