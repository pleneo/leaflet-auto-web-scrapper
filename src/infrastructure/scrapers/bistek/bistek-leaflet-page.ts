import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { BistekLeafletCard, BistekMonitoredStore } from './bistek-image-gallery-leaflet';

export interface OpenBistekLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface BistekLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface BistekLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  discoverStores(): Promise<readonly BistekMonitoredStore[]>;
  ensureStoreSelectionModalOpen(): Promise<void>;
  getCitySelectionVisualTarget(store: BistekMonitoredStore): Promise<BistekLeafletVisualTarget>;
  selectCity(store: BistekMonitoredStore): Promise<void>;
  getStoreSelectionVisualTarget(store: BistekMonitoredStore): Promise<BistekLeafletVisualTarget>;
  selectStore(store: BistekMonitoredStore): Promise<void>;
  waitForStoreLeaflets(store: BistekMonitoredStore): Promise<void>;
  discoverCards(store: BistekMonitoredStore): Promise<readonly BistekLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<BistekLeafletVisualTarget>;
  openLeafletAt(cardIndex: number): Promise<void>;
  getImageDownloadVisualTarget(): Promise<BistekLeafletVisualTarget>;
  resolveActiveDownloadImageUrl(): Promise<string>;
  getModalCloseVisualTarget(): Promise<BistekLeafletVisualTarget>;
  closeLeafletModal(): Promise<void>;
  close(): Promise<void>;
}

export interface BistekLeafletPageFactory {
  openPage(input: OpenBistekLeafletPageInput): Promise<BistekLeafletPage>;
}
