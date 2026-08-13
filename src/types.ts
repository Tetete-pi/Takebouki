/**
 * ガチャシミュレーターの型定義。
 *
 * 抽選方式:「排出先に決める方式」
 *   1. items から weight による重み付き抽選で「排出アイテム」を1つ決める
 *   2. そのアイテムの rarity が持つ staging（通常/当たり）で「演出動画」が決まる
 *   3. 演出動画 → アイテムの排出動画、の順で再生する
 */

/** 演出のタイプ。通常演出 or 当たり演出の2種類。 */
export type StagingType = "normal" | "hit";

/** レア度。どの演出（通常/当たり）を再生するかを内包する。 */
export interface Rarity {
  /** 内部ID（例: "n", "r", "sr", "ssr"） */
  id: string;
  /** 画面表示用ラベル（例: "SSR"） */
  label: string;
  /** バッジ等に使うアクセントカラー */
  color: string;
  /** このレア度が出たときに再生する演出タイプ */
  staging: StagingType;
}

/** ガチャのラインナップ1件（= 排出動画1本に対応）。 */
export interface GachaItem {
  /** 内部ID */
  id: string;
  /** アイテム名 */
  name: string;
  /** 参照するレア度ID（rarities の id と対応） */
  rarityId: string;
  /**
   * 重み付き抽選の重み。大きいほど出やすい。
   * 確率は「自分の weight ÷ 全 weight の合計」で決まる。
   */
  weight: number;
  /** 排出動画のファイル名（videoBasePath/drops/ 配下） */
  dropVideo: string;
}

/** 演出動画（2種類）のファイル名設定。 */
export interface StagingConfig {
  /** 通常演出のファイル名（videoBasePath/staging/ 配下） */
  normal: string;
  /** 当たり演出のファイル名（videoBasePath/staging/ 配下） */
  hit: string;
}

/** 実mp4が無い/読み込めない場合のプレースホルダ演出の尺（秒）。 */
export interface PlaceholderDurations {
  staging: number;
  drop: number;
}

/** ガチャ全体の設定（マニフェスト）。 */
export interface GachaManifest {
  /** タイトル表示 */
  title: string;
  /** 動画配置のベースパス（末尾スラッシュなし） */
  videoBasePath: string;
  /** 演出動画（通常/当たり） */
  staging: StagingConfig;
  /** レア度定義 */
  rarities: Rarity[];
  /** ラインナップ（排出アイテム） */
  items: GachaItem[];
  /** プレースホルダ演出の尺 */
  placeholderDurations: PlaceholderDurations;
}

/** 1回のガチャ抽選結果。 */
export interface DrawResult {
  item: GachaItem;
  rarity: Rarity;
  staging: StagingType;
}
