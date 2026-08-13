import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { TaustePublication } from './tauste-pdf-leaflet';

export interface OpenTausteLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface TausteLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface TausteOpenedPublicationPage {
  waitForPublicationPlayer(): Promise<void>;
  getPdfDownloadVisualTarget(): Promise<TausteLeafletVisualTarget>;
  resolvePdfDownloadUrl(): Promise<string>;
  getCurrentUrl(): Promise<string>;
  close(): Promise<void>;
}

export interface TausteLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  getCurrentUrl(): Promise<string>;
  waitForInstitutionalHomePage(): Promise<void>;
  getHeroOffersVisualTarget(): Promise<TausteLeafletVisualTarget>;
  openHeroOffersPage(): Promise<void>;
  getFooterOffersVisualTarget(): Promise<TausteLeafletVisualTarget>;
  openFooterOffersPage(): Promise<void>;
  waitForFlipsnackProfilePage(): Promise<void>;
  listPublicationCards(): Promise<readonly TaustePublication[]>;
  getPublicationCardVisualTarget(cardIndex: number): Promise<TausteLeafletVisualTarget>;
  openPublication(cardIndex: number): Promise<TausteOpenedPublicationPage>;
  close(): Promise<void>;
}

export interface TausteLeafletPageFactory {
  openPage(input: OpenTausteLeafletPageInput): Promise<TausteLeafletPage>;
}
