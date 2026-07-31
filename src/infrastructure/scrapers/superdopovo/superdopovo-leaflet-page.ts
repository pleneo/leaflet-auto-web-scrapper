import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';

export interface OpenSuperDoPovoLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface SuperDoPovoLeafletCard {
  readonly title: string;
  readonly coverImageUrl: string;
}

export interface OpenedSuperDoPovoLeaflet {
  readonly title: string;
  readonly imageUrls: readonly string[];
}

export interface SuperDoPovoLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface SuperDoPovoLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  dismissCookieBanner(): Promise<void>;
  getSectionsMenuVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget>;
  openSectionsMenu(): Promise<void>;
  getLeafletsLinkVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget>;
  openLeafletsPage(expectedUrl: string): Promise<void>;
  discoverCards(): Promise<readonly SuperDoPovoLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<SuperDoPovoLeafletVisualTarget>;
  openLeafletAt(cardIndex: number): Promise<OpenedSuperDoPovoLeaflet>;
  getLeafletModalImageVisualTarget(imageIndex: number): Promise<SuperDoPovoLeafletVisualTarget>;
  getLeafletModalCloseVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget>;
  closeLeafletModal(): Promise<void>;
  close(): Promise<void>;
}

export interface SuperDoPovoLeafletPageFactory {
  openPage(input: OpenSuperDoPovoLeafletPageInput): Promise<SuperDoPovoLeafletPage>;
}
