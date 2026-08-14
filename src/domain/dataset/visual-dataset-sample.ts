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

export interface AssaiLeafletFlowVisualDatasetSubject {
  readonly subjectKind: 'assai-leaflet-flow';
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly targetIndex: number | null;
}

export interface AngeloniRegionSelectionVisualDatasetSubject {
  readonly subjectKind: 'angeloni-region-selection';
  readonly regionSlug: string;
  readonly regionName: string;
  readonly stateCode: string;
  readonly cityName: string;
}

export interface AngeloniLeafletLinkVisualDatasetSubject {
  readonly subjectKind: 'angeloni-leaflet-link';
  readonly regionSlug: string;
  readonly regionName: string;
  readonly stateCode: string;
  readonly cityName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface ComboAtacadistaHomeOffersLinkVisualDatasetSubject {
  readonly subjectKind: 'comboatacadista-home-offers-link';
}

export interface ComboAtacadistaLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'comboatacadista-leaflet-card';
  readonly cardIndex: number;
  readonly leafletId: string;
  readonly leafletTitle: string;
}

export interface ComboAtacadistaLeafletImageVisualDatasetSubject {
  readonly subjectKind: 'comboatacadista-leaflet-image';
  readonly leafletId: string;
  readonly leafletTitle: string;
  readonly imageIndex: number;
  readonly imageUrl: string;
}

export interface CoopHomeOffersLinkVisualDatasetSubject {
  readonly subjectKind: 'coop-home-offers-link';
}

export interface CoopStoreLinkVisualDatasetSubject {
  readonly subjectKind: 'coop-store-link';
  readonly storeSlug: string;
  readonly storeName: string;
  readonly storeUrl: string;
}

export interface CoopLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'coop-leaflet-card';
  readonly storeSlug: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletId: string;
  readonly leafletTitle: string;
}

export interface CoopLeafletImageVisualDatasetSubject {
  readonly subjectKind: 'coop-leaflet-image';
  readonly storeSlug: string;
  readonly storeName: string;
  readonly leafletId: string;
  readonly leafletTitle: string;
  readonly imageIndex: number;
  readonly imageUrl: string;
}

export interface TausteHomeOffersLinkVisualDatasetSubject {
  readonly subjectKind: 'tauste-home-offers-link';
  readonly href: string;
}

export interface TausteFooterOffersLinkVisualDatasetSubject {
  readonly subjectKind: 'tauste-footer-offers-link';
  readonly href: string;
}

export interface TaustePublicationCardVisualDatasetSubject {
  readonly subjectKind: 'tauste-publication-card';
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly publicationUrl: string;
  readonly publishedAtIso: string | null;
  readonly coverImageUrl: string | null;
}

export interface TaustePdfDownloadVisualDatasetSubject {
  readonly subjectKind: 'tauste-pdf-download';
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly publicationUrl: string;
  readonly pdfUrl: string | null;
}

export interface BistekCitySelectionVisualDatasetSubject {
  readonly subjectKind: 'bistek-city-selection';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
}

export interface BistekStoreSelectionVisualDatasetSubject {
  readonly subjectKind: 'bistek-store-selection';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
}

export interface BistekLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'bistek-leaflet-card';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface BistekImageDownloadVisualDatasetSubject {
  readonly subjectKind: 'bistek-image-download';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly imageIndex: number;
  readonly leafletTitle: string;
  readonly imageUrl: string;
}

export interface BistekModalCloseVisualDatasetSubject {
  readonly subjectKind: 'bistek-modal-close';
  readonly stateCode: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly storeId: string;
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
  | AtacadaoLeafletCardVisualDatasetSubject
  | AssaiLeafletFlowVisualDatasetSubject
  | AngeloniRegionSelectionVisualDatasetSubject
  | AngeloniLeafletLinkVisualDatasetSubject
  | ComboAtacadistaHomeOffersLinkVisualDatasetSubject
  | ComboAtacadistaLeafletCardVisualDatasetSubject
  | ComboAtacadistaLeafletImageVisualDatasetSubject
  | CoopHomeOffersLinkVisualDatasetSubject
  | CoopStoreLinkVisualDatasetSubject
  | CoopLeafletCardVisualDatasetSubject
  | CoopLeafletImageVisualDatasetSubject
  | TausteHomeOffersLinkVisualDatasetSubject
  | TausteFooterOffersLinkVisualDatasetSubject
  | TaustePublicationCardVisualDatasetSubject
  | TaustePdfDownloadVisualDatasetSubject
  | BistekCitySelectionVisualDatasetSubject
  | BistekStoreSelectionVisualDatasetSubject
  | BistekLeafletCardVisualDatasetSubject
  | BistekImageDownloadVisualDatasetSubject
  | BistekModalCloseVisualDatasetSubject;

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
