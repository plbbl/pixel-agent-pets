import {invoke, isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {Preferences} from './preferences';
import type {ActivitySnapshot} from './behavior';

export type PetCommand = {type: 'character' | 'action' | 'showcase' | 'size' | 'quality' | 'follow' | 'visible'; value: string | number | boolean};
export type NativePreferences = Preferences & {visible?: boolean; smokeTest?: boolean; activity?: ActivitySnapshot};
export const native = isTauri();
export async function call<T = void>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!native) return;
  return invoke<T>(command, args);
}
export async function commands(receive: (command: PetCommand) => void): Promise<() => void> {
  if (!native) return () => {};
  return listen<PetCommand>('pet:command', event => receive(event.payload));
}
export async function activityEvents(receive: (value: unknown) => void): Promise<() => void> {
  if (!native) return () => {};
  return listen<unknown>('pet:activity', event => receive(event.payload));
}
export async function interactionEvents(receive: (value: {type: string; distance?: number}) => void): Promise<() => void> {
  if (!native) return () => {};
  return listen<{type: string; distance?: number}>('pet:interaction', event => receive(event.payload));
}
