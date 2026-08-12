import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

export interface OpenAngeloniLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface AngeloniLeafletLink {
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
}

export interface AngeloniLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface AngeloniLeafletPage {
  goto(url: string): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  dismissCookieBanner(): Promise<void>;
  getRegionLinkVisualTarget(region: AngeloniMonitoredRegion): Promise<AngeloniLeafletVisualTarget>;
  openRegion(region: AngeloniMonitoredRegion): Promise<void>;
  waitForRegionLeaflets(region: AngeloniMonitoredRegion): Promise<void>;
  discoverLeafletLinks(): Promise<readonly AngeloniLeafletLink[]>;
  getLeafletLinkVisualTarget(cardIndex: number): Promise<AngeloniLeafletVisualTarget>;
  resolveLeafletPdfUrl(cardIndex: number): Promise<string>;
  close(): Promise<void>;
}

export interface AngeloniLeafletPageFactory {
  openPage(input: OpenAngeloniLeafletPageInput): Promise<AngeloniLeafletPage>;
}
