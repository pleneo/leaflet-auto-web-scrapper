import type { DocumentScrollPosition, ViewportSize } from './bounding-box';

export interface ScreenshotMetadata {
  readonly fileName: string;
  readonly mimeType: 'image/png';
  readonly fullPage: true;
  readonly viewport: ViewportSize;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly scrollPosition: DocumentScrollPosition;
  readonly capturedAtIso: string;
}
