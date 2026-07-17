export function createLeafletId(title: string, cardIndex: number): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) {
    return `leaflet-${String(cardIndex + 1)}`;
  }

  return `${String(cardIndex + 1)}-${slug}`;
}
