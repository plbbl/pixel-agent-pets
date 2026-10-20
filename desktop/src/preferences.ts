import {petView, type PetQuality, type PetView} from '../../src/pet-view';
import type {Character} from '../../src/policy';
import type {Follow} from './behavior';

export type Preferences = PetView & {character: Character; follow: Follow};
export const preferenceKey = 'baobaolong.desktop.preferences.v1';
export const characters: Character[] = ['claude', 'gpt', 'deepseek', 'clawd'];
export const qualities: PetQuality[] = ['auto', '80', '160', '320'];
export const followModes: Follow[] = ['auto', 'codex', 'dsh', 'off'];

export function preferences(value: unknown): Preferences {
  const input = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return {...petView(input), character: characters.includes(input.character!) ? input.character! : 'claude', follow: followModes.includes(input.follow!) ? input.follow! : 'auto'};
}

export function readPreferences(storage: Pick<Storage, 'getItem'>): Preferences {
  try { return preferences(JSON.parse(storage.getItem(preferenceKey) || '{}')); }
  catch { return preferences(null); }
}

export function savePreferences(storage: Pick<Storage, 'setItem'>, value: Preferences): void {
  try { storage.setItem(preferenceKey, JSON.stringify(preferences(value))); } catch { /* Native storage remains authoritative. */ }
}

/** Reserve the widest authored prop and a caption line without moving the pet. */
export function geometry(size: number) {
  const sanitized = petView({size, quality: 'auto'}).size;
  return {width: Math.max(256, Math.ceil(sanitized * 1.6 + 16)), height: sanitized + 54, baseline: 42 + sanitized * 67 / 80};
}
