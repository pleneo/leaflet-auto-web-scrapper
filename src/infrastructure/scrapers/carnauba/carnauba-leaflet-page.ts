import type { VisualViewport } from '../../../domain/visual/viewport';

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

export interface CarnaubaLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  discoverCards(): Promise<readonly CarnaubaLeafletCard[]>;
  openLeafletAt(cardIndex: number): Promise<OpenedCarnaubaLeaflet>;
  closeLeafletModal(): Promise<void>;
  close(): Promise<void>;
}

export interface CarnaubaLeafletPageFactory {
  openPage(input: OpenCarnaubaLeafletPageInput): Promise<CarnaubaLeafletPage>;
}
