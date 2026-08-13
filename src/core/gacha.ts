import type { DrawResult, GachaItem, GachaManifest, Rarity } from "../types";
import { defaultRng, type Rng } from "./rng";

/**
 * マニフェストの整合性チェック。
 * 参照先の rarity が無い / weight が不正 / 演出未定義などを早期に検出する。
 */
export function validateManifest(manifest: GachaManifest): string[] {
  const errors: string[] = [];
  const rarityIds = new Set(manifest.rarities.map((r) => r.id));

  if (manifest.items.length === 0) {
    errors.push("items が空です。ラインナップを1件以上定義してください。");
  }
  if (!manifest.staging.normal) errors.push("staging.normal が未設定です。");
  if (!manifest.staging.hit) errors.push("staging.hit が未設定です。");

  let totalWeight = 0;
  for (const item of manifest.items) {
    if (!rarityIds.has(item.rarityId)) {
      errors.push(`item "${item.id}" の rarityId "${item.rarityId}" に対応するレア度がありません。`);
    }
    if (!(item.weight > 0)) {
      errors.push(`item "${item.id}" の weight は正の数である必要があります（現在: ${item.weight}）。`);
    } else {
      totalWeight += item.weight;
    }
    if (!item.dropVideo) {
      errors.push(`item "${item.id}" の dropVideo（排出動画ファイル名）が未設定です。`);
    }
  }
  if (totalWeight <= 0) {
    errors.push("weight の合計が0以下です。抽選できません。");
  }
  return errors;
}

/** レアリティIDから Rarity を引く（見つからなければ throw）。 */
export function getRarity(manifest: GachaManifest, rarityId: string): Rarity {
  const rarity = manifest.rarities.find((r) => r.id === rarityId);
  if (!rarity) {
    throw new Error(`rarityId "${rarityId}" に対応するレア度が見つかりません。`);
  }
  return rarity;
}

/**
 * 単発ガチャを1回引く。
 *
 * 「排出先に決める方式」:
 *   1. weight による重み付き抽選で排出アイテムを1つ決定
 *   2. そのアイテムの rarity.staging で演出（通常/当たり）が決まる
 */
export function drawOnce(manifest: GachaManifest, rng: Rng = defaultRng): DrawResult {
  const item = pickWeighted(manifest.items, rng);
  const rarity = getRarity(manifest, item.rarityId);
  return { item, rarity, staging: rarity.staging };
}

/** weight による重み付き抽選。 */
export function pickWeighted(items: GachaItem[], rng: Rng = defaultRng): GachaItem {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = rng() * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold < 0) return item;
  }
  // 浮動小数点誤差で漏れた場合の保険
  return items[items.length - 1];
}

/** 表示・デバッグ用: 各アイテムの排出確率（0..1）。 */
export function computeItemProbabilities(manifest: GachaManifest): Map<string, number> {
  const total = manifest.items.reduce((sum, item) => sum + item.weight, 0);
  const map = new Map<string, number>();
  for (const item of manifest.items) {
    map.set(item.id, total > 0 ? item.weight / total : 0);
  }
  return map;
}

/** 表示・デバッグ用: レア度ごとの合算確率（0..1）。 */
export function computeRarityProbabilities(manifest: GachaManifest): Map<string, number> {
  const total = manifest.items.reduce((sum, item) => sum + item.weight, 0);
  const map = new Map<string, number>();
  for (const item of manifest.items) {
    const prev = map.get(item.rarityId) ?? 0;
    map.set(item.rarityId, prev + (total > 0 ? item.weight / total : 0));
  }
  return map;
}
