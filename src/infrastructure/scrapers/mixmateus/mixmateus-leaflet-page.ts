import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

export interface OpenMixMateusLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface MixMateusLeafletCard {
  readonly title: string;
  readonly cardIndex: number;
}

export interface OpenedMixMateusPdfLeaflet {
  readonly title: string;
  readonly pdfUrl: string;
}

export interface MixMateusLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface MixMateusLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  dismissCookieBanner(): Promise<void>;
  getStateSelectionVisualTarget(
    store: MixMateusMonitoredStore,
  ): Promise<MixMateusLeafletVisualTarget>;
  selectState(store: MixMateusMonitoredStore): Promise<void>;
  getCitySelectionVisualTarget(
    store: MixMateusMonitoredStore,
  ): Promise<MixMateusLeafletVisualTarget>;
  selectCity(store: MixMateusMonitoredStore): Promise<void>;
  getStoreSelectionVisualTarget(
    store: MixMateusMonitoredStore,
  ): Promise<MixMateusLeafletVisualTarget>;
  selectStore(store: MixMateusMonitoredStore): Promise<void>;
  waitForStoreLeaflets(store: MixMateusMonitoredStore): Promise<void>;
  discoverCards(): Promise<readonly MixMateusLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<MixMateusLeafletVisualTarget>;
  openLeafletAt(cardIndex: number): Promise<void>;
  getPdfDownloadVisualTarget(): Promise<MixMateusLeafletVisualTarget>;
  resolvePdfDownloadUrl(): Promise<string>;
  closeLeafletModal(): Promise<void>;
  close(): Promise<void>;
}

export interface MixMateusLeafletPageFactory {
  openPage(input: OpenMixMateusLeafletPageInput): Promise<MixMateusLeafletPage>;
}
