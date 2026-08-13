import { resolveAssetUrl } from "../core/assets";

/**
 * BGM プレイヤー（Web Audio API 方式）。
 *
 * BGM を Web Audio で鳴らすことで、演出/排出の <video>（メディア要素）と
 * 別系統になり、iOS でも動画に割り込まれず同時に鳴らせる。
 * （<audio> 要素だと、動画再生が始まった瞬間に iOS が音声セッションを奪って
 *   BGM が止まってしまう＝「一瞬鳴って消える」現象が起きる。）
 *
 * ガチャ開始ボタン押下（ユーザー操作の実行スタック内）で start() を呼ぶと、
 * AudioContext を resume して再生を開始する。ループはしない。押すたびに頭から。
 * fadeOut() は GainNode で滑らかに音量を下げて停止する。
 *
 * Web Audio が使えない環境では <audio> 要素にフォールバックする。
 */
export class BgmPlayer {
  private readonly url: string;

  // Web Audio 用
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private wantPlay = false;

  // フォールバック用（<audio>）
  private audioEl: HTMLAudioElement | null = null;
  private fadeId = 0;

  constructor(src: string) {
    this.url = resolveAssetUrl(src);

    // iOS の音声セッションを「再生」に（対応環境のみ・無害）
    try {
      const audioSession = (navigator as unknown as {
        audioSession?: { type: string };
      }).audioSession;
      if (audioSession) audioSession.type = "playback";
    } catch {
      /* 未対応環境は無視 */
    }

    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (Ctor) {
      try {
        this.ctx = new Ctor();
        void this.loadBuffer();
      } catch {
        this.ctx = null;
      }
    }
    if (!this.ctx) this.initFallback();
  }

  /** BGM を最初から再生開始する（ユーザー操作起点で呼ぶこと）。 */
  start(): void {
    this.cancelFade();

    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.buffer) {
        this.playNow();
      } else {
        this.wantPlay = true; // デコード完了時に再生する
      }
      return;
    }

    // フォールバック（<audio>）
    if (this.audioEl) {
      this.setElVolume(1);
      try {
        this.audioEl.currentTime = 0;
      } catch {
        /* noop */
      }
      void this.audioEl.play().catch(() => {});
    }
  }

  /** GainNode（または volume）で徐々に音量を下げて停止する。 */
  fadeOut(durationMs = 800): void {
    this.cancelFade();

    if (this.ctx && this.source && this.gain) {
      const now = this.ctx.currentTime;
      const end = now + Math.max(0.05, durationMs / 1000);
      try {
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.linearRampToValueAtTime(0.0001, end);
      } catch {
        /* noop */
      }
      const src = this.source;
      try {
        src.stop(end + 0.02);
      } catch {
        /* noop */
      }
      // 参照を手放す（次回再生は新しい source を作る）
      this.source = null;
      this.gain = null;
      this.wantPlay = false;
      return;
    }

    // フォールバック（<audio> の volume フェード）
    const el = this.audioEl;
    if (el && !el.paused) {
      const steps = 24;
      const stepMs = Math.max(16, durationMs / steps);
      const startVol = this.getElVolume();
      let i = 0;
      this.fadeId = window.setInterval(() => {
        i += 1;
        this.setElVolume(Math.max(0, startVol * (1 - i / steps)));
        if (i >= steps) this.stopFallback();
      }, stepMs);
    }
    this.wantPlay = false;
  }

  /** 即時停止する。 */
  stop(): void {
    this.cancelFade();
    this.wantPlay = false;
    this.stopSource();
    this.stopFallback();
  }

  // ---- Web Audio 内部 ------------------------------------------------------

  private async loadBuffer(): Promise<void> {
    if (!this.ctx) return;
    try {
      const res = await fetch(this.url);
      const arr = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arr);
      if (this.wantPlay) this.playNow();
    } catch {
      // 取得/デコード失敗時は <audio> にフォールバック
      this.ctx = null;
      this.initFallback();
      if (this.wantPlay) this.start();
    }
  }

  private playNow(): void {
    if (!this.ctx || !this.buffer) return;
    this.wantPlay = false;
    this.stopSource();

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = false;
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain).connect(this.ctx.destination);
    source.start(0);

    this.source = source;
    this.gain = gain;
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* noop */
      }
      try {
        this.source.disconnect();
      } catch {
        /* noop */
      }
      this.source = null;
    }
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        /* noop */
      }
      this.gain = null;
    }
  }

  // ---- フォールバック（<audio>） -------------------------------------------

  private initFallback(): void {
    if (this.audioEl) return;
    const el = new Audio();
    el.src = this.url;
    el.loop = false;
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    document.body.appendChild(el);
    el.load();
    this.audioEl = el;
  }

  private stopFallback(): void {
    this.cancelFade();
    if (!this.audioEl) return;
    this.audioEl.pause();
    try {
      this.audioEl.currentTime = 0;
    } catch {
      /* noop */
    }
    this.setElVolume(1);
  }

  private cancelFade(): void {
    if (this.fadeId) {
      window.clearInterval(this.fadeId);
      this.fadeId = 0;
    }
  }

  private getElVolume(): number {
    try {
      return this.audioEl ? this.audioEl.volume : 1;
    } catch {
      return 1;
    }
  }

  private setElVolume(v: number): void {
    try {
      if (this.audioEl) this.audioEl.volume = v;
    } catch {
      /* iOS 等 volume 変更不可の環境では無視 */
    }
  }
}
