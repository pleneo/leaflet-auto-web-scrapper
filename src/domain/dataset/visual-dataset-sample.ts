import type { PixelBoundingBox, NormalizedBoundingBox } from './bounding-box';
import type { DatasetSplit } from './dataset-split';
import type { FsmStateName } from '../extraction/fsm-state-name';
import type { ScreenshotMetadata } from './screenshot-metadata';
import type { SupermarketId } from '../supermarket/supermarket-id';
import type { TargetSemanticLabel } from './target-semantic-label';

export interface VisualTargetAnnotation {
  readonly label: TargetSemanticLabel;
  readonly viewportBox: PixelBoundingBox;
  readonly documentBox: PixelBoundingBox;
  readonly normalizedDocumentBox: NormalizedBoundingBox;
}

export interface CarnaubaLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'carnauba-leaflet-card';
  readonly storeId: number;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface CarnaubaLeafletImageVisualDatasetSubject {
  readonly subjectKind: 'carnauba-leaflet-image';
  readonly storeId: number;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
  readonly imageIndex: number;
  readonly imageUrl: string;
}

export interface CarnaubaLeafletModalCloseVisualDatasetSubject {
  readonly subjectKind: 'carnauba-leaflet-modal-close';
  readonly storeId: number;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface CarnaubaHomeLeafletsLinkVisualDatasetSubject {
  readonly subjectKind: 'carnauba-home-leaflets-link';
  readonly storeId: number;
  readonly storeName: string;
}

export interface SuperDoPovoSectionsMenuVisualDatasetSubject {
  readonly subjectKind: 'superdopovo-sections-menu';
}

export interface SuperDoPovoLeafletsLinkVisualDatasetSubject {
  readonly subjectKind: 'superdopovo-leaflets-link';
}

export interface SuperDoPovoLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'superdopovo-leaflet-card';
  readonly shopId: number;
  readonly shopName: string;
  readonly cardIndex: number;
  readonly bookletId: number;
  readonly bookletTitle: string;
}

export interface SuperDoPovoLeafletImageVisualDatasetSubject {
  readonly subjectKind: 'superdopovo-leaflet-image';
  readonly shopId: number;
  readonly shopName: string;
  readonly cardIndex: number;
  readonly bookletId: number;
  readonly bookletTitle: string;
  readonly imageIndex: number;
  readonly imageUrl: string;
}

export interface SuperDoPovoLeafletModalCloseVisualDatasetSubject {
  readonly subjectKind: 'superdopovo-leaflet-modal-close';
  readonly shopId: number;
  readonly shopName: string;
  readonly cardIndex: number;
  readonly bookletId: number;
  readonly bookletTitle: string;
}

export interface MixMateusStateSelectionVisualDatasetSubject {
  readonly subjectKind: 'mixmateus-state-selection';
  readonly stateCode: string;
  readonly stateName: string;
}

export interface MixMateusCitySelectionVisualDatasetSubject {
  readonly subjectKind: 'mixmateus-city-selection';
  readonly stateCode: string;
  readonly cityName: string;
}

export interface MixMateusStoreSelectionVisualDatasetSubject {
  readonly subjectKind: 'mixmateus-store-selection';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
}

export interface MixMateusLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'mixmateus-leaflet-card';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface MixMateusPdfDownloadVisualDatasetSubject {
  readonly subjectKind: 'mixmateus-pdf-download';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface AtacadaoStorePageVisualDatasetSubject {
  readonly subjectKind: 'atacadao-store-page';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
}

export interface AtacadaoShowMoreLeafletsVisualDatasetSubject {
  readonly subjectKind: 'atacadao-show-more-leaflets';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
}

export interface AtacadaoLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'atacadao-leaflet-card';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export type VisualDatasetSubject =
  | CarnaubaHomeLeafletsLinkVisualDatasetSubject
  | CarnaubaLeafletCardVisualDatasetSubject
  | CarnaubaLeafletImageVisualDatasetSubject
  | CarnaubaLeafletModalCloseVisualDatasetSubject
  | SuperDoPovoSectionsMenuVisualDatasetSubject
  | SuperDoPovoLeafletsLinkVisualDatasetSubject
  | SuperDoPovoLeafletCardVisualDatasetSubject
  | SuperDoPovoLeafletImageVisualDatasetSubject
  | SuperDoPovoLeafletModalCloseVisualDatasetSubject
  | MixMateusStateSelectionVisualDatasetSubject
  | MixMateusCitySelectionVisualDatasetSubject
  | MixMateusStoreSelectionVisualDatasetSubject
  | MixMateusLeafletCardVisualDatasetSubject
  | MixMateusPdfDownloadVisualDatasetSubject
  | AtacadaoStorePageVisualDatasetSubject
  | AtacadaoShowMoreLeafletsVisualDatasetSubject
  | AtacadaoLeafletCardVisualDatasetSubject;

export interface VisualDatasetSample {
  readonly sampleId: string;
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly stateName: FsmStateName;
  readonly pageUrl: string;
  readonly subject: VisualDatasetSubject;
  readonly screenshotPng: Uint8Array;
  readonly screenshotMetadata: ScreenshotMetadata;
  readonly target: VisualTargetAnnotation;
  readonly split: DatasetSplit;
}
