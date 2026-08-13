import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { CoopLeafletCard } from './coop-image-gallery-leaflet';
import type { CoopMonitoredStore } from './coop-targets';

export interface OpenCoopLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface CoopLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface CoopLeafletMagazinePage {
  waitForImageGallery(): Promise<void>;
  listLeafletImageUrls(): Promise<readonly string[]>;
  getLeafletImageVisualTarget(imageIndex: number): Promise<CoopLeafletVisualTarget>;
  getCurrentUrl(): Promise<string>;
  close(): Promise<void>;
}

export interface CoopLeafletPage {
  goto(url: string): Promise<void>;
  gotoHome(): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  getCurrentUrl(): Promise<string>;
  waitForHomePage(): Promise<void>;
  waitForOffersPage(): Promise<void>;
  waitForStoreOffersPage(store: CoopMonitoredStore): Promise<void>;
  getHomeOffersVisualTarget(): Promise<CoopLeafletVisualTarget>;
  openHomeOffersPage(): Promise<void>;
  getStoreLinkVisualTarget(store: CoopMonitoredStore): Promise<CoopLeafletVisualTarget>;
  openStore(store: CoopMonitoredStore): Promise<void>;
  listLeafletCards(): Promise<readonly CoopLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<CoopLeafletVisualTarget>;
  openLeafletCardInNewPage(cardIndex: number): Promise<CoopLeafletMagazinePage>;
  close(): Promise<void>;
}

export interface CoopLeafletPageFactory {
  openPage(input: OpenCoopLeafletPageInput): Promise<CoopLeafletPage>;
}
