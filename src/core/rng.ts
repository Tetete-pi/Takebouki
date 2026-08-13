/**
 * 乱数生成。
 *
 * デフォルトは Math.random。テストや再現確認のために seed 指定で
 * 決定論的な乱数列（mulberry32）も使えるようにしておく。
 */
export type Rng = () => number;

/** 既定の乱数（0以上1未満）。 */
export const defaultRng: Rng = Math.random;

/**
 * seed から決定論的な乱数生成関数を作る（mulberry32）。
 * 同じ seed なら常に同じ乱数列を返す。
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
