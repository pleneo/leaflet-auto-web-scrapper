import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { AtacadaoMonitoredStore } from './atacadao-targets';

export interface OpenAtacadaoLeafletPageInput {
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
}

export interface AtacadaoLeafletCard {
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
  readonly validityText: string | null;
}

export interface AtacadaoLeafletVisualTarget {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export interface AtacadaoLeafletPage {
  goto(url: string): Promise<void>;
  isStorePageUnavailable(): Promise<boolean>;
  resolveStorePageUrl(store: AtacadaoMonitoredStore): Promise<string | null>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  dismissCookieBanner(): Promise<void>;
  waitForStoreLeaflets(store: AtacadaoMonitoredStore): Promise<void>;
  hasMoreLeaflets(): Promise<boolean>;
  getShowMoreLeafletsVisualTarget(): Promise<AtacadaoLeafletVisualTarget>;
  showMoreLeaflets(): Promise<void>;
  discoverCards(): Promise<readonly AtacadaoLeafletCard[]>;
  getLeafletCardVisualTarget(cardIndex: number): Promise<AtacadaoLeafletVisualTarget>;
  close(): Promise<void>;
}

export interface AtacadaoLeafletPageFactory {
  openPage(input: OpenAtacadaoLeafletPageInput): Promise<AtacadaoLeafletPage>;
}
