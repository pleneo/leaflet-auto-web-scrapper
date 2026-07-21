import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';

export interface OpenCarnaubaLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface CarnaubaLeafletCard {
  readonly title: string;
  readonly coverImageUrl: string;
}

export interface OpenedCarnaubaLeaflet {
  readonly title: string;
  readonly imageUrls: readonly string[];
}

export interface CarnaubaLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface CarnaubaLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  getLeafletsPageVisualTarget(): Promise<CarnaubaLeafletVisualTarget>;
  openLeafletsPage(expectedUrl: string): Promise<void>;
  discoverCards(): Promise<readonly CarnaubaLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<CarnaubaLeafletVisualTarget>;
  openLeafletAt(cardIndex: number): Promise<OpenedCarnaubaLeaflet>;
  getLeafletModalImageVisualTarget(): Promise<CarnaubaLeafletVisualTarget>;
  closeLeafletModal(): Promise<void>;
  close(): Promise<void>;
}

export interface CarnaubaLeafletPageFactory {
  openPage(input: OpenCarnaubaLeafletPageInput): Promise<CarnaubaLeafletPage>;
}
