import { resolveAssetUrl } from "../core/assets";

/**
 * BGM プレイヤー。
 *
 * ガチャ開始ボタンが押されたタイミング（＝ユーザー操作の実行スタック内）で
 * start() を呼ぶことで、音付き再生の許可を得て再生を開始する。ループはしない。
 * ボタンが押されるたびに最初から再生し直す。
 */
export class BgmPlayer {
  private readonly audio: HTMLAudioElement;

  constructor(src: string) {
    this.audio = new Audio();
    this.audio.src = resolveAssetUrl(src);
    this.audio.loop = false; // ループしない
    this.audio.preload = "auto";
    this.audio.load();
  }

  /** 最初から再生を開始する（ユーザー操作起点で呼ぶこと）。 */
  start(): void {
    try {
      this.audio.currentTime = 0;
    } catch {
      /* まだ読み込めていない場合は無視 */
    }
    // 音付き再生が拒否された場合は握りつぶす（BGM は必須ではないため）
    void this.audio.play().catch(() => {});
  }

  /** 再生を止める。 */
  stop(): void {
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      /* noop */
    }
  }
}
