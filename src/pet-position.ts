export type PetPoint = {x: number; y: number};
export type PetPosition = {mode: 'anchored'} | ({mode: 'free'} & PetPoint);
export type PetViewport = {width: number; height: number; left?: number; top?: number};
export const positionKey = 'pixel-agent-pets.position.v1';
export const positionEvent = 'pixel-agent-pets:position';
export const anchoredPosition = (): PetPosition => ({mode: 'anchored'});

export function petPosition(value: unknown): PetPosition {
 const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 return input.mode === 'free' && typeof input.x === 'number' && Number.isFinite(input.x) && typeof input.y === 'number' && Number.isFinite(input.y)
  ? {mode: 'free', x: input.x, y: input.y} : anchoredPosition();
}
export function readPetPosition(raw: string | null): PetPosition {
 try { const value = JSON.parse(raw || 'null'); return value?.version === 1 ? petPosition(value) : anchoredPosition(); }
 catch { return anchoredPosition(); }
}
export function savePetPosition(value: PetPosition): string { return JSON.stringify({version: 1, ...petPosition(value)}); }

/** Keep the widest authored prop and the existing upper caption in the viewport. */
export function clampPetPoint(point: PetPoint, requestedSize: number, viewport: PetViewport): PetPoint {
 const size = Math.min(224, Math.max(80, Number.isFinite(requestedSize) ? requestedSize : 80));
 const width = Math.max(0, viewport.width), height = Math.max(0, viewport.height), left = viewport.left || 0, top = viewport.top || 0;
 const before = Math.max(size * .3, Math.max(180, size) - size), after = size * .3, above = Math.max(0, 14 - size * .075);
 const axis = (value: number, origin: number, space: number, leading: number, trailing: number) => {
  const low = origin + 8 + leading, high = origin + space - 8 - size - trailing;
  return low <= high ? Math.min(high, Math.max(low, Number.isFinite(value) ? value : low)) : origin + (space - size + leading - trailing) / 2;
 };
 return {x: axis(point.x, left, width, before, after), y: axis(point.y, top, height, above, 0)};
}

/** A click keeps its binding. Only a deliberate pointer displacement detaches it. */
export function draggedPetPoint(origin: PetPoint, start: PetPoint, current: PetPoint, size: number, viewport: PetViewport, threshold = 5): PetPoint | null {
 const dx = current.x - start.x, dy = current.y - start.y;
 return Math.hypot(dx, dy) < threshold ? null : clampPetPoint({x: origin.x + dx, y: origin.y + dy}, size, viewport);
}
