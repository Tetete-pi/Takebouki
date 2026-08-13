/**
 * アセットURLの差し替え。
 * `window.__ASSET_MAP__`（{ 元のパス: 差し替え先URL }）があれば適用する。
 * 単一HTMLプレビューでの data URI 埋め込みや、CDN配信への切り替えに使える。
 */
export function resolveAssetUrl(src: string): string {
  const map = (globalThis as { __ASSET_MAP__?: Record<string, string> }).__ASSET_MAP__;
  return (map && map[src]) || src;
}
