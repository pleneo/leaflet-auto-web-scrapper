import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { AssaiMonitoredStore } from './assai-targets';

export interface OpenAssaiLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface AssaiLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface AssaiLeafletPage {
  goto(url: string): Promise<void>;
  gotoHome(): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  dismissCookieBanner(): Promise<void>;
  getOffersLinkVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  openOffersPage(): Promise<void>;
  waitForLeafletsPage(): Promise<void>;
  isLeafletsPageAvailable(): Promise<boolean>;
  getCurrentUrl(): Promise<string>;
  getChooseStoreVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  openStoreSelector(): Promise<void>;
  getStateSelectVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  selectState(store: AssaiMonitoredStore): Promise<void>;
  getCitySelectVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  selectCity(store: AssaiMonitoredStore): Promise<void>;
  getStoreSelectVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  selectStore(store: AssaiMonitoredStore): Promise<void>;
  getConfirmStoreVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  confirmStoreSelection(): Promise<void>;
  getLeafletTabVisualTarget(tabIndex: number): Promise<AssaiLeafletVisualTarget>;
  openLeafletTab(tabIndex: number): Promise<void>;
  getDownloadImageVisualTarget(): Promise<AssaiLeafletVisualTarget>;
  close(): Promise<void>;
}

export interface AssaiLeafletPageFactory {
  openPage(input: OpenAssaiLeafletPageInput): Promise<AssaiLeafletPage>;
}
