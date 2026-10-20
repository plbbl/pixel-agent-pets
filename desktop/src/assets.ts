import {hdAssetURL, type HDManifest} from '../../src/pet-view';
import {names, type Character, type Pack} from '../../src/policy';

export function localAssets(base = new URL('baobaolong-assets/', document.baseURI), request: typeof fetch = fetch) {
  const pending = new Map<Character, Promise<Pack>>();
  let hd: Promise<HDManifest | null> | undefined;
  return {
    pack(character: Character): Promise<Pack> {
      let result = pending.get(character);
      if (!result) {
        result = request(new URL(`assets/${character}/manifest.json`, base)).then(async response => {
          if (!response.ok) throw Error('Pet manifest unavailable');
          const value = await response.json() as Pack;
          const entries = Object.entries(value.animations ?? {});
          if (!entries.length) throw Error('Empty pet manifest');
          const urls: Record<string, string> = {};
          for (const [action, a] of entries) {
            if (!/^[A-Za-z0-9_-]+$/.test(action) || !/^[A-Za-z0-9_-]+\.png$/.test(a.file) ||
                !Number.isInteger(a.width) || a.width < 1 || a.width > 128 || a.height !== 80 ||
                !Number.isInteger(a.frames) || a.frames < 1 || a.frames > 1000 ||
                !Number.isInteger(a.columns) || a.columns < 1 || a.columns > 16 ||
                !(a.fps > 0 && a.fps <= 60)) throw Error('Invalid pet atlas metadata');
            urls[action] = new URL(`assets/${character}/${a.file}`, base).href;
          }
          return {name: names[character], animations: value.animations, urls};
        }).catch(error => { pending.delete(character); throw error; });
        pending.set(character, result);
      }
      return result;
    },
    hd(): Promise<HDManifest | null> {
      return hd ??= request(new URL('assets-hd/manifest.json', base)).then(async response => {
        if (!response.ok) throw Error('HD metadata unavailable');
        const value = await response.json();
        return value?.version === 1 && value.characters && typeof value.characters === 'object' ? value as HDManifest : null;
      }).catch(() => null);
    },
    hdURL(character: string, action: string, file: string): string | null {
      return hdAssetURL(character, action, file) ? new URL('assets-hd/' + file, base).href : null;
    },
  };
}
