import type { Locator, Page } from 'playwright';
import type {
  VisualActionTarget,
  VisualDatasetPage,
  VisualDatasetPageSnapshot,
} from '../../application/ports/visual-dataset-page';
import { createPixelBoundingBox } from '../../domain/dataset/bounding-box';

interface BrowserPageMetrics {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

export class PlaywrightVisualDatasetPage implements VisualDatasetPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async captureFullPageSnapshot(): Promise<VisualDatasetPageSnapshot> {
    const viewport = this.page.viewportSize();

    if (viewport === null) {
      throw new Error('Playwright page viewport must be configured before visual dataset capture.');
    }

    const metrics = await this.page.evaluate((): BrowserPageMetrics => {
      return {
        documentWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
          document.documentElement.clientWidth,
        ),
        documentHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.clientHeight,
        ),
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    });

    return {
      pageUrl: this.page.url(),
      screenshotPng: await this.page.screenshot({
        fullPage: true,
        type: 'png',
      }),
      viewport,
      documentSize: {
        width: metrics.documentWidth,
        height: metrics.documentHeight,
      },
      scrollPosition: {
        scrollX: metrics.scrollX,
        scrollY: metrics.scrollY,
      },
    };
  }
}

export class PlaywrightVisualActionTarget implements VisualActionTarget {
  readonly locatorDescription: string;

  private readonly locator: Locator;

  private readonly timeoutMs: number;

  constructor(locator: Locator, locatorDescription: string, timeoutMs: number) {
    this.locator = locator;
    this.locatorDescription = locatorDescription;
    this.timeoutMs = timeoutMs;
  }

  async scrollIntoView(): Promise<void> {
    await this.locator.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
  }

  isVisible(): Promise<boolean> {
    return this.locator.isVisible({
      timeout: this.timeoutMs,
    });
  }

  isEnabled(): Promise<boolean> {
    return this.locator.isEnabled({
      timeout: this.timeoutMs,
    });
  }

  async getViewportBoundingBox(): Promise<ReturnType<typeof createPixelBoundingBox> | null> {
    const box = await this.locator.boundingBox({
      timeout: this.timeoutMs,
    });

    if (box === null) {
      return null;
    }

    return createPixelBoundingBox({
      xMin: box.x,
      yMin: box.y,
      xMax: box.x + box.width,
      yMax: box.y + box.height,
    });
  }
}
