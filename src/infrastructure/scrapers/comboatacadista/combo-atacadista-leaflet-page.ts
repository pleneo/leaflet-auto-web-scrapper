import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { ComboAtacadistaLeafletCard } from './combo-atacadista-image-gallery-leaflet';

export interface OpenComboAtacadistaLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface ComboAtacadistaLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface ComboAtacadistaLeafletPage {
  goto(url: string): Promise<void>;
  gotoHome(): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  getCurrentUrl(): Promise<string>;
  getHomeOffersVisualTarget(): Promise<ComboAtacadistaLeafletVisualTarget>;
  openHomeOffersPage(): Promise<void>;
  waitForOffersPage(): Promise<void>;
  listLeafletCards(): Promise<readonly ComboAtacadistaLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<ComboAtacadistaLeafletVisualTarget>;
  openLeafletCard(cardIndex: number): Promise<void>;
  waitForImageGallery(): Promise<void>;
  listLeafletImageUrls(): Promise<readonly string[]>;
  getLeafletImageVisualTarget(imageIndex: number): Promise<ComboAtacadistaLeafletVisualTarget>;
  close(): Promise<void>;
}

export interface ComboAtacadistaLeafletPageFactory {
  openPage(input: OpenComboAtacadistaLeafletPageInput): Promise<ComboAtacadistaLeafletPage>;
}
