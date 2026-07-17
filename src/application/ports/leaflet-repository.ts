import type { PromotionLeaflet } from '../../domain/leaflet/promotion-leaflet';

export interface LeafletRepository {
  save(leaflet: PromotionLeaflet): Promise<void>;
}
