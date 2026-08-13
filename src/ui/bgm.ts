import { resolveAssetUrl } from "../core/assets";

/**
 * BGM プレイヤー。
 *
 * ガチャ開始ボタンが押されたタイミング（＝ユーザー操作の実行スタック内）で
 * start() を呼ぶことで、音付き再生の許可を得て再生を開始する。ループはしない。
 * ボタンが押されるたびに最初から再生し直す。
 *
 * fadeOut() で徐々に音量を下げて停止する（「もう一度引く」時に使用）。
 * volume 変更が効かない環境（iOS Safari 等）では、フェードはかからないが
 * 最終的に停止はする。
 */
export class BgmPlayer {
  private readonly audio: HTMLAudioElement;
  private fadeId = 0;

  constructor(src: string) {
    this.audio = new Audio();
    this.audio.src = resolveAssetUrl(src);
    this.audio.loop = false; // ループしない
    this.audio.preload = "auto";
    this.audio.load();
  }

  /** 最初から再生を開始する（ユーザー操作起点で呼ぶこと）。 */
  start(): void {
    this.cancelFade();
    this.setVolume(1);
    try {
      this.audio.currentTime = 0;
    } catch {
      /* まだ読み込めていない場合は無視 */
    }
    // 音付き再生が拒否された場合は握りつぶす（BGM は必須ではないため）
    void this.audio.play().catch(() => {});
  }

  /** 徐々に音量を下げて停止する。 */
  fadeOut(durationMs = 800): void {
    this.cancelFade();
    if (this.audio.paused) return; // 再生していなければ何もしない
    const steps = 24;
    const stepMs = Math.max(16, durationMs / steps);
    const startVol = this.getVolume();
    let i = 0;
    this.fadeId = window.setInterval(() => {
      i += 1;
      this.setVolume(Math.max(0, startVol * (1 - i / steps)));
      if (i >= steps) this.finishStop();
    }, stepMs);
  }

  /** 即時停止する。 */
  stop(): void {
    this.cancelFade();
    this.finishStop();
  }

  private finishStop(): void {
    this.cancelFade();
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      /* noop */
    }
    this.setVolume(1); // 次回再生のために戻す
  }

  private cancelFade(): void {
    if (this.fadeId) {
      window.clearInterval(this.fadeId);
      this.fadeId = 0;
    }
  }

  private getVolume(): number {
    try {
      return this.audio.volume;
    } catch {
      return 1;
    }
  }

  private setVolume(v: number): void {
    try {
      this.audio.volume = v;
    } catch {
      /* iOS 等 volume 変更不可の環境では無視 */
    }
  }
}
