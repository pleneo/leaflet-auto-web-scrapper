import type { CaptureRegion } from '../../domain/visual/capture-region';
import type { VisualViewport } from '../../domain/visual/viewport';

export interface OpenVisualBrowserPageRequest {
  readonly viewport: VisualViewport;
}

export interface VisualBrowserPage {
  goto(url: string, timeoutMs: number): Promise<void>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  title(): Promise<string>;
  currentUrl(): string;
  screenshotPage(fullPage: boolean): Promise<Uint8Array>;
  screenshotRegion(region: CaptureRegion): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface VisualBrowserFactory {
  openPage(input: OpenVisualBrowserPageRequest): Promise<VisualBrowserPage>;
}
