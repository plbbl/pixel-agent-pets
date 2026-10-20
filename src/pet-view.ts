export type PetQuality = 'auto' | '80' | '160' | '320';
export type PetView = {size: number; quality: PetQuality};
export type HDVariant = {width: number; height: number; columns: number; chunkFrames: number; frames: number; fps: number; files: string[]};
export type HDManifest = {version: 1; characters: Record<string, {animations: Record<string, Partial<Record<'160' | '320', HDVariant>>>}>};
export const viewKey = 'pixel-agent-pets.view';
export const defaultPetView: PetView = {size: 80, quality: 'auto'};
export function petView(value: unknown): PetView {
  const input = value && typeof value === 'object' ? value as Partial<PetView> : {};
  const size = Number(input.size);
  return {
    size: Number.isFinite(size) ? Math.max(80, Math.min(224, Math.round(size))) : 80,
    quality: ['auto', '80', '160', '320'].includes(input.quality ?? '') ? input.quality! : 'auto',
  };
}
export function readPetView(value: string | null): PetView {
  try { return petView(JSON.parse(value || '{}')); } catch { return {...defaultPetView}; }
}
export function petResolution(view: PetView, dpr: number, originalPixels = false): 80 | 160 | 320 {
  if (originalPixels) return 80;
  if (view.quality !== 'auto') return Number(view.quality) as 80 | 160 | 320;
  const physicalSize = view.size * Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  return physicalSize <= 80 ? 80 : physicalSize <= 160 ? 160 : 320;
}
export const hdAssetBase = '/pixel-agent-pets/assets/';
let manifestPromise: Promise<HDManifest | null> | undefined;
export function loadHDManifest(): Promise<HDManifest | null> {
  if (!manifestPromise) manifestPromise = fetch(hdAssetBase + 'manifest.json').then(async response => {
    if (!response.ok) throw Error('Pet HD metadata unavailable');
    const manifest = await response.json();
    if (manifest?.version !== 1 || !manifest.characters || typeof manifest.characters !== 'object') throw Error('Invalid pet HD metadata');
    return manifest as HDManifest;
  }).catch(() => { manifestPromise = undefined; return null; });
  return manifestPromise;
}
export function hdAssetURL(character: string, action: string, file: string): string | null {
  const prefix = character + '/' + action + '/';
  if (!/^(claude|gpt|deepseek)$/.test(character) || !/^[A-Za-z0-9_-]+$/.test(action) || !file.startsWith(prefix) || !/^(160|320)-\d+\.png$/.test(file.slice(prefix.length))) return null;
  return hdAssetBase + file;
}
