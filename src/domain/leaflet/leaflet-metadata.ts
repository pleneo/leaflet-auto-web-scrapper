export interface BaseLeafletMetadata {
  readonly metadataKind: 'base';
  readonly capturedAtIso: string;
  readonly sourcePageUrl: string;
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
  readonly city: string | null;
  readonly stateCode: string | null;
}

export interface CarnaubaLeafletMetadata {
  readonly metadataKind: 'carnauba';
  readonly capturedAtIso: string;
  readonly sourcePageUrl: string;
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
  readonly city: string | null;
  readonly stateCode: string | null;
  readonly branchId: string;
  readonly branchSlug: string;
}

export interface AssaiLeafletMetadata {
  readonly metadataKind: 'assai';
  readonly capturedAtIso: string;
  readonly sourcePageUrl: string;
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
  readonly city: string | null;
  readonly stateCode: string | null;
  readonly regionCode: string | null;
}

export interface MixMateusLeafletMetadata {
  readonly metadataKind: 'mixmateus';
  readonly capturedAtIso: string;
  readonly sourcePageUrl: string;
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly storeSlug: string;
}

export interface AtacadaoLeafletMetadata {
  readonly metadataKind: 'atacadao';
  readonly capturedAtIso: string;
  readonly sourcePageUrl: string;
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly storeSlug: string;
}

export type LeafletMetadata =
  | BaseLeafletMetadata
  | CarnaubaLeafletMetadata
  | AssaiLeafletMetadata
  | MixMateusLeafletMetadata
  | AtacadaoLeafletMetadata;
