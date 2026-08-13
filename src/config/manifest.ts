import type { GachaManifest } from "../types";

/**
 * ガチャ設定。ここを編集するだけでラインナップ・確率・動画ファイルを差し替えられる。
 *
 * ■ 動画の置き場所
 *   - 演出動画: public/assets/videos/staging/ に staging.normal / staging.hit のファイル名で置く
 *   - 排出動画: public/assets/videos/drops/    に 各 item.dropVideo のファイル名で置く
 *
 * ■ ファイルがまだ無いとき
 *   実mp4が存在しない/読み込めない場合は、自動的に canvas のプレースホルダ演出に
 *   フォールバックするので、アセットが揃う前でも全フローを動作確認できる。
 *
 * ■ 確率について
 *   各アイテムの排出確率は「item.weight ÷ 全 weight 合計」で決まる。
 *   演出（通常/当たり）は、抽選されたアイテムの rarity.staging によって決まる。
 */
export const manifest: GachaManifest = {
  title: "Takebouki Gacha",
  videoBasePath: "assets/videos",

  // 演出動画は2種類のみ
  staging: {
    normal: "staging_normal.mp4",
    hit: "staging_hit.mp4",
  },

  // レア度: どのレア度が「当たり演出」になるかを staging で指定
  rarities: [
    { id: "n", label: "N", color: "#9aa4b2", staging: "normal" },
    { id: "r", label: "R", color: "#4aa3ff", staging: "normal" },
    { id: "sr", label: "SR", color: "#b06bff", staging: "hit" },
    { id: "ssr", label: "SSR", color: "#ffcc33", staging: "hit" },
  ],

  // ラインナップ（= 排出動画の本数分だけ定義する）
  items: [
    { id: "n_01", name: "ブロンズソード", rarityId: "n", weight: 500, dropVideo: "n_01.mp4" },
    { id: "n_02", name: "レザーアーマー", rarityId: "n", weight: 500, dropVideo: "n_02.mp4" },
    { id: "r_01", name: "シルバーランス", rarityId: "r", weight: 150, dropVideo: "r_01.mp4" },
    { id: "r_02", name: "ミスリルシールド", rarityId: "r", weight: 150, dropVideo: "r_02.mp4" },
    { id: "sr_01", name: "炎竜の大剣", rarityId: "sr", weight: 45, dropVideo: "sr_01.mp4" },
    { id: "sr_02", name: "氷結の魔杖", rarityId: "sr", weight: 45, dropVideo: "sr_02.mp4" },
    { id: "ssr_01", name: "星辰のエクスカリバー", rarityId: "ssr", weight: 10, dropVideo: "ssr_01.mp4" },
  ],

  // 実mp4が無いときのプレースホルダ演出の尺（秒）
  placeholderDurations: {
    staging: 2.4,
    drop: 3.0,
  },
};
