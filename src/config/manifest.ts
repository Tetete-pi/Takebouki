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

  // BGM: 開始ボタン押下時に再生開始（ループなし）
  bgm: "assets/audio/bgm.mp3",

  // 演出動画は2種類のみ
  // ※ 当たり演出は暫定的に通常演出と同じ動画を使用中。
  //    本番の当たり演出動画が用意できたら hit を "staging_hit.mp4" に戻す。
  staging: {
    normal: "staging_normal.mp4",
    hit: "staging_normal.mp4",
  },

  // レア度: どのレア度が「当たり演出」になるかを staging で指定
  rarities: [
    { id: "n", label: "N", color: "#9aa4b2", staging: "normal" },
    { id: "r", label: "R", color: "#4aa3ff", staging: "normal" },
    { id: "sr", label: "SR", color: "#b06bff", staging: "hit" },
    { id: "ssr", label: "SSR", color: "#ffcc33", staging: "hit" },
  ],

  // ラインナップ（= 排出動画の本数分だけ定義する）
  // レア度は暫定。weight が大きいほど出やすい。
  // ※ 竹とんぼ・武井壮の排出動画は暫定的に takebouki.mp4 を使用中（後日差し替え）。
  items: [
    { id: "takebouki", name: "竹ボウキ", rarityId: "n", weight: 500, dropVideo: "takebouki.mp4" },
    { id: "taketombo", name: "竹とんぼ", rarityId: "n", weight: 500, dropVideo: "takebouki.mp4" },
    { id: "takenoko", name: "タケノコ", rarityId: "r", weight: 150, dropVideo: "takenoko.mp4" },
    { id: "takecopter", name: "タケコプター", rarityId: "sr", weight: 45, dropVideo: "takecopter.mp4" },
    { id: "takeishou", name: "武井壮", rarityId: "ssr", weight: 10, dropVideo: "takebouki.mp4" },
  ],

  // 実mp4が無いときのプレースホルダ演出の尺（秒）
  placeholderDurations: {
    staging: 2.4,
    drop: 3.0,
  },
};
