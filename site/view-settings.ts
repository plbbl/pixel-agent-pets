export type SourceQuality = 'pixel' | '360' | '720';
export type Quality = 'auto' | SourceQuality;
export type ViewSettings = { quality: Quality; size: number };
export const defaultView: ViewSettings = { quality: 'auto', size: 216 };
export function qualityValue(value: unknown): Quality | undefined {
  return value === 'auto' || value === 'pixel' || value === '360' || value === '720' ? value : undefined;
}
export function sizeValue(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return;
  if (typeof value === 'string' && !value.trim()) return;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(54, Math.min(300, Math.round(number))) : undefined;
}
export function readViewSettings(search: string, stored?: string | null): ViewSettings {
  let saved: Partial<ViewSettings> = {};
  try { saved = JSON.parse(stored || '{}') ?? {}; } catch { /* Invalid storage is optional. */ }
  const query = new URLSearchParams(search);
  return {
    quality: qualityValue(query.get('quality')) ?? qualityValue(saved.quality) ?? defaultView.quality,
    size: sizeValue(query.get('size')) ?? sizeValue(saved.size) ?? defaultView.size,
  };
}
/** A common shoe baseline keeps the atlas and HD render at the same apparent size. */
export function stagePlacement(requestedSize: number, availableWidth: number, aspect = 1) {
  const actor = Math.min(requestedSize, Math.max(54, availableWidth * .64 / Math.max(1, aspect)));
  const videoSize = actor / .675;
  const height = Math.max(310, videoSize + 80);
  const baseline = height - Math.max(42, videoSize * .1625 + 12);
  return { actor, videoSize, videoWidth: videoSize * aspect, height, baseline, videoTop: baseline - videoSize * .8375 };
}

/** Choose the smallest original source that covers the physical on-screen actor. */
export function resolveQuality(quality: Quality, actorSize: number, dpr = 1, originalPixels = false): SourceQuality {
  if (originalPixels) return 'pixel';
  if (quality !== 'auto') return quality;
  const physicalHeight = actorSize * Math.max(1, Math.min(4, Number.isFinite(dpr) ? dpr : 1));
  return physicalHeight <= 54 ? 'pixel' : physicalHeight <= 243 ? '360' : '720';
}
