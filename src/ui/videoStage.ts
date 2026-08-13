/**
 * 動画再生ステージ（ダブルバッファ方式）。
 *
 * <video> を2つ使い、あるクリップを再生している裏でもう一方に次のクリップを
 * プリロードしておく。これにより演出動画 → 排出動画の切り替えを、暗転を挟まず
 * 瞬時に行える（シームレス再生）。
 *
 * mp4 が存在しない/読み込めない場合は canvas の「プレースホルダ演出」に
 * 自動フォールバックするので、実アセットが無くても全フローを確認できる。
 */

import { resolveAssetUrl } from "../core/assets";

export interface ClipOptions {
  /** 動画ファイルのURL（存在しなければプレースホルダにフォールバック） */
  src: string;
  /** プレースホルダ時に表示するラベル */
  label: string;
  /** プレースホルダ時のアクセントカラー */
  accent: string;
  /** プレースホルダ時の尺（秒） */
  placeholderDuration: number;
  /** 画面下に出す補足テキスト（任意） */
  caption?: string;
}

export class VideoStage {
  readonly element: HTMLElement;

  /** 表示/プリロード用の video 2枚（ダブルバッファ） */
  private readonly videos: [HTMLVideoElement, HTMLVideoElement];
  /** 現在の表バッファ（再生中）のインデックス */
  private front = 0;
  /** 各 video に読み込み済みの解決後URL（不要な再ロードを避ける） */
  private readonly loadedSrc = new WeakMap<HTMLVideoElement, string>();

  private readonly canvas: HTMLCanvasElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly badge: HTMLElement;

  private rafId = 0;
  private placeholderTimer = 0;
  private loadTimer = 0;
  private resolveCurrent: (() => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "stage";

    this.videos = [this.createVideo(), this.createVideo()];

    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage__canvas";
    this.canvas.width = 720;
    this.canvas.height = 1280;

    this.badge = document.createElement("div");
    this.badge.className = "stage__badge";
    this.badge.hidden = true;

    this.skipButton = document.createElement("button");
    this.skipButton.type = "button";
    this.skipButton.className = "stage__skip";
    this.skipButton.textContent = "スキップ »";
    this.skipButton.hidden = true;
    this.skipButton.addEventListener("click", () => this.endCurrent());

    this.element.append(this.videos[0], this.videos[1], this.canvas, this.badge, this.skipButton);
    this.drawIdle();
  }

  private createVideo(): HTMLVideoElement {
    const v = document.createElement("video");
    v.className = "stage__video";
    v.playsInline = true;
    // 音あり再生。最初のクリップの play() をユーザー操作の実行スタックで呼ぶことで
    // 音付き再生の許可を得る（拒否時はミュートで再試行）。
    v.muted = false;
    v.preload = "auto";
    return v;
  }

  /**
   * クリップ列をシームレスに連続再生する。
   * 各クリップ再生中に次クリップを裏バッファへプリロードしておき、
   * 切り替え時は暗転を挟まず瞬時に次を表示・再生する。
   *
   * @param onClipStart 各クリップの再生開始時に、そのインデックスで呼ばれる。
   */
  async playSequence(
    clips: ClipOptions[],
    onClipStart?: (index: number) => void,
  ): Promise<void> {
    if (clips.length === 0) return;
    this.stopPlaceholder();
    this.showBadge(false);
    this.skipButton.hidden = false;

    // クリップ0: 表バッファに読み込み、暗転カバーを出しつつ再生開始
    // （ユーザー操作起点なので音あり）。
    onClipStart?.(0);
    let playPromise = this.beginClip(this.videos[this.front], clips[0], true);

    for (let i = 0; i < clips.length; i++) {
      const next = clips[i + 1] as ClipOptions | undefined;

      // 現クリップ再生中に、次クリップを裏バッファへプリロード
      if (next) this.preloadClip(this.videos[1 - this.front], next);

      // 現クリップの終了（再生完了 / スキップ / フォールバック）を待つ
      await playPromise;

      if (next) {
        // シームレス切り替え: 裏（プリロード済み）を表にして即再生。
        // 旧表は次クリップが表示された時点（reveal）で隠す。
        this.front = 1 - this.front;
        onClipStart?.(i + 1);
        playPromise = this.beginClip(this.videos[this.front], next, false);
      } else {
        // 最終クリップ終了: 動画を隠す（ネイティブ再生ボタンの露出防止）
        this.videos[this.front].classList.remove("is-active");
      }
    }

    this.skipButton.hidden = true;
  }

  /** 結果表示用のバッジ（レア度など）を出す。 */
  showResultBadge(text: string, accent: string): void {
    this.badge.textContent = text;
    this.badge.style.setProperty("--accent", accent);
    this.showBadge(true);
  }

  /** ステージを初期状態（待機）に戻す。 */
  reset(): void {
    this.stopPlaceholder();
    this.clearLoadTimer();
    this.resolveCurrent = null;
    this.skipButton.hidden = true;
    this.showBadge(false);
    for (const v of this.videos) {
      v.classList.remove("is-active");
      v.onended = null;
      v.onerror = null;
      try {
        v.pause();
      } catch {
        /* noop */
      }
    }
    this.drawIdle();
  }

  // ---- クリップ再生 --------------------------------------------------------

  /** src を（未ロードなら）設定して読み込む。プリロード・本再生の両方で使う。 */
  private ensureLoaded(video: HTMLVideoElement, url: string): void {
    if (this.loadedSrc.get(video) !== url) {
      this.loadedSrc.set(video, url);
      video.src = url;
      video.load();
    }
  }

  /** 裏バッファに次クリップを先読みしておく（再生はしない）。 */
  private preloadClip(video: HTMLVideoElement, clip: ClipOptions): void {
    this.ensureLoaded(video, resolveAssetUrl(clip.src));
    try {
      video.pause();
    } catch {
      /* noop */
    }
  }

  /**
   * 指定の video でクリップを再生する。再生完了/スキップ/フォールバックで解決する
   * Promise を返す。
   * @param cover true のとき（＝待機からの最初のクリップ）は読み込み中に暗転カバーを出す。
   *              false のとき（＝シームレス切り替え）はカバーを出さず、実際に再生が
   *              始まった瞬間に映像を差し替える。
   */
  private beginClip(video: HTMLVideoElement, clip: ClipOptions, cover: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveCurrent = resolve;
      this.stopPlaceholder();
      this.clearLoadTimer();

      let settled = false;

      const reveal = () => {
        if (settled) return;
        settled = true;
        this.clearLoadTimer();
        this.canvas.classList.remove("is-active");
        video.classList.add("is-active");
        // 反対側（直前のクリップ）の映像はここで隠す＝切り替わった瞬間に入れ替え
        this.otherVideo(video).classList.remove("is-active");
      };

      const usePlaceholder = () => {
        if (settled) return;
        settled = true;
        this.clearLoadTimer();
        this.videos[0].classList.remove("is-active");
        this.videos[1].classList.remove("is-active");
        this.runPlaceholder(clip);
      };

      video.onended = () => this.endCurrent();
      video.onerror = () => usePlaceholder();

      this.ensureLoaded(video, resolveAssetUrl(clip.src));

      if (cover) {
        // 待機からの最初のクリップは、読み込み中に暗転カバーを出す
        this.showCover();
      }
      // cover=false のときは直前クリップの映像を残したまま、reveal で瞬時に差し替える

      // 再生を開始する。最初のクリップはユーザー操作の実行スタックから呼ばれるため
      // 音付き再生が許可される。音付きが拒否されたらミュートで再試行。
      video.muted = false;
      const tryPlay = (isRetry: boolean) => {
        Promise.resolve(video.play())
          .then(reveal)
          .catch(() => {
            if (settled) return;
            if (!isRetry && !video.muted) {
              video.muted = true;
              tryPlay(true);
            } else {
              usePlaceholder();
            }
          });
      };
      tryPlay(false);

      // 読み込みが全く進まない場合のフォールバック（欠損/未対応など）
      this.loadTimer = window.setTimeout(() => {
        if (!settled && video.readyState === 0) usePlaceholder();
      }, 1500);
    });
  }

  /** 現在のクリップを終了させる（再生完了・スキップ共通）。 */
  private endCurrent(): void {
    this.stopPlaceholder();
    this.clearLoadTimer();
    const current = this.videos[this.front];
    current.onended = null;
    current.onerror = null;
    try {
      current.pause();
    } catch {
      /* noop */
    }
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    resolve?.();
  }

  private otherVideo(video: HTMLVideoElement): HTMLVideoElement {
    return this.videos[0] === video ? this.videos[1] : this.videos[0];
  }

  // ---- 表示ヘルパ ----------------------------------------------------------

  private showBadge(show: boolean): void {
    this.badge.hidden = !show;
  }

  /** クリップ切り替え中の暗転カバー（ネイティブ動画UIの露出を防ぐ）。 */
  private showCover(): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx) this.fillBackground(ctx);
    this.canvas.classList.add("is-active");
  }

  /** canvas の背景（暗いグラデーション）を塗る。 */
  private fillBackground(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0b0e17");
    bg.addColorStop(1, "#141a2b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  // ---- プレースホルダ演出（canvas） ---------------------------------------

  private runPlaceholder(clip: ClipOptions): void {
    this.videos[0].classList.remove("is-active");
    this.videos[1].classList.remove("is-active");
    this.canvas.classList.add("is-active");

    const ctx = this.canvas.getContext("2d");
    const start = performance.now();
    const durationMs = Math.max(0.4, clip.placeholderDuration) * 1000;

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      if (ctx) this.drawPlaceholderFrame(ctx, t, clip);
      if (t >= 1) {
        this.endCurrent();
        return;
      }
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);

    // 保険: raf が止まっても必ず終わらせる
    this.placeholderTimer = window.setTimeout(() => this.endCurrent(), durationMs + 400);
  }

  private drawPlaceholderFrame(ctx: CanvasRenderingContext2D, t: number, clip: ClipOptions): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.fillBackground(ctx);

    const cx = w / 2;
    const cy = h / 2;

    // 回転する放射光
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * Math.PI * 2);
    const rays = 16;
    for (let i = 0; i < rays; i++) {
      ctx.rotate((Math.PI * 2) / rays);
      const grad = ctx.createLinearGradient(0, 0, 0, -h);
      grad.addColorStop(0, hexToRgba(clip.accent, 0.0));
      grad.addColorStop(0.5, hexToRgba(clip.accent, 0.14 + 0.12 * Math.sin(t * Math.PI)));
      grad.addColorStop(1, hexToRgba(clip.accent, 0.0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, -h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 中央で膨らむリング
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 3);
    const radius = 120 + pulse * 90 + t * 120;
    ctx.strokeStyle = hexToRgba(clip.accent, 0.9);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba("#ffffff", 0.5 * (1 - t));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // ラベル
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 76px system-ui, sans-serif";
    ctx.fillText(clip.label, cx, cy);

    // DEMO ウォーターマーク（実mp4が無いことを明示）
    ctx.fillStyle = hexToRgba("#ffffff", 0.35);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillText("DEMO (mp4未配置)", cx, cy + 90);

    if (clip.caption) {
      ctx.fillStyle = hexToRgba("#ffffff", 0.7);
      ctx.font = "500 34px system-ui, sans-serif";
      ctx.fillText(clip.caption, cx, h - 120);
    }

    // 進捗バー
    ctx.fillStyle = hexToRgba("#ffffff", 0.15);
    ctx.fillRect(cx - 200, h - 70, 400, 8);
    ctx.fillStyle = hexToRgba(clip.accent, 1);
    ctx.fillRect(cx - 200, h - 70, 400 * t, 8);
  }

  /** 待機中の静止画（暗い背景のみ。中央には「引く」ボタンをオーバーレイ表示）。 */
  private drawIdle(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    this.canvas.classList.add("is-active");
    this.fillBackground(ctx);
  }

  private stopPlaceholder(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.placeholderTimer) window.clearTimeout(this.placeholderTimer);
    this.rafId = 0;
    this.placeholderTimer = 0;
  }

  private clearLoadTimer(): void {
    if (this.loadTimer) window.clearTimeout(this.loadTimer);
    this.loadTimer = 0;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
