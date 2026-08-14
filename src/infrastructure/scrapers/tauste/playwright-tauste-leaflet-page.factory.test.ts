import { describe, expect, it } from 'vitest';
import { readTausteFlipsnackPublicationSegment } from './playwright-tauste-leaflet-page.factory';

describe('readTausteFlipsnackPublicationSegment', () => {
  it('reads the publication segment from Flipsnack full-view URLs', () => {
    expect(
      readTausteFlipsnackPublicationSegment(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru-zufbi5p7t9/full-view.html',
      ),
    ).toBe('ofertas-tauste-bauru-zufbi5p7t9');
    expect(
      readTausteFlipsnackPublicationSegment(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-mar-lia3/full-view.html',
      ),
    ).toBe('ofertas-tauste-mar-lia3');
    expect(
      readTausteFlipsnackPublicationSegment(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-campinas2-zt56m3cvxn.html',
      ),
    ).toBe('ofertas-tauste-campinas2-zt56m3cvxn');
  });

  it('returns null when the URL does not expose a publication segment', () => {
    expect(readTausteFlipsnackPublicationSegment('https://www.flipsnack.com')).toBeNull();
  });
});
