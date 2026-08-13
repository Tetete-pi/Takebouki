/**
 * 動画再生ステージ。
 *
 * 1つの <video> を使い回して、演出動画 → 排出動画 を順に再生する。
 * mp4 が存在しない/読み込めない場合は canvas の「プレースホルダ演出」に
 * 自動フォールバックするので、実アセットが無くても全フローを確認できる。
 */

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
  private readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly badge: HTMLElement;

  private rafId = 0;
  private placeholderTimer = 0;
  private resolveCurrent: (() => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "stage";

    this.video = document.createElement("video");
    this.video.className = "stage__video";
    this.video.playsInline = true;
    this.video.muted = true; // 自動再生の制約回避（音声が必要なら後述の note 参照）
    this.video.preload = "auto";

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
    this.skipButton.addEventListener("click", () => this.finish());

    this.element.append(this.video, this.canvas, this.badge, this.skipButton);
  }

  /**
   * 1クリップを再生し、再生完了（または スキップ）で解決する Promise を返す。
   */
  play(opts: ClipOptions): Promise<void> {
    this.stopPlaceholder();
    this.showBadge(false);

    return new Promise<void>((resolve) => {
      this.resolveCurrent = resolve;
      this.skipButton.hidden = false;

      // 直前クリップの動画がそのまま残ると、再生が終わった動画要素に対して
      // モバイルブラウザが大きな再生/リプレイボタンを重ねて表示してしまう。
      // 新クリップのロード中は動画要素を隠し、暗転カバー（canvas）を挟むことで
      // ネイティブの再生UIが露出しないようにする。動画は実際に再生が始まる
      // （canplay）まで表示しない。
      this.video.classList.remove("is-active");
      this.showCover();

      let settled = false;
      let starting = false;
      const usePlaceholder = () => {
        if (settled) return;
        settled = true;
        this.runPlaceholder(opts);
      };

      // 動画側のイベント
      const onEnded = () => this.finish();
      const onError = () => usePlaceholder();
      const onCanPlay = () => {
        if (settled || starting) return;
        starting = true;
        // 実際に再生が始まってから動画を表示する。play() が拒否された場合
        // （自動再生ブロック等）は動画を出さずプレースホルダへフォールバック
        // するので、一時停止状態の動画（＝ネイティブ再生ボタン）が露出しない。
        Promise.resolve(this.video.play())
          .then(() => {
            if (settled) return;
            settled = true;
            this.canvas.classList.remove("is-active");
            this.video.classList.add("is-active");
          })
          .catch(() => usePlaceholder());
      };

      this.video.onended = onEnded;
      this.video.onerror = onError;
      this.video.oncanplay = onCanPlay;

      // src を設定してロード開始（アセットURLの差し替えがあれば適用）
      this.video.src = resolveAssetUrl(opts.src);
      this.video.load();

      // ロードが一定時間で進まない場合もプレースホルダへ
      window.setTimeout(() => {
        if (!settled && this.video.readyState < 2) {
          usePlaceholder();
        }
      }, 1200);
    });
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
    this.skipButton.hidden = true;
    this.showBadge(false);
    this.video.classList.remove("is-active");
    this.canvas.classList.remove("is-active");
    this.video.removeAttribute("src");
    this.video.load();
    this.drawIdle();
  }

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

  private finish(): void {
    this.stopPlaceholder();
    this.skipButton.hidden = true;
    this.video.onended = null;
    this.video.onerror = null;
    this.video.oncanplay = null;
    try {
      this.video.pause();
    } catch {
      /* noop */
    }
    // 再生を終えた動画要素を表示したままにすると、ネイティブのリプレイボタンが
    // 出てしまう。クリップ終了時は必ず動画を隠す。
    this.video.classList.remove("is-active");
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    resolve?.();
  }

  // ---- プレースホルダ演出（canvas） ---------------------------------------

  private runPlaceholder(opts: ClipOptions): void {
    this.video.classList.remove("is-active");
    this.canvas.classList.add("is-active");

    const ctx = this.canvas.getContext("2d");
    const start = performance.now();
    const durationMs = Math.max(0.4, opts.placeholderDuration) * 1000;

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      if (ctx) this.drawPlaceholderFrame(ctx, t, opts);
      if (t >= 1) {
        this.finish();
        return;
      }
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);

    // 保険: raf が止まっても必ず終わらせる
    this.placeholderTimer = window.setTimeout(() => this.finish(), durationMs + 400);
  }

  private drawPlaceholderFrame(ctx: CanvasRenderingContext2D, t: number, opts: ClipOptions): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 背景グラデーション
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
      grad.addColorStop(0, hexToRgba(opts.accent, 0.0));
      grad.addColorStop(0.5, hexToRgba(opts.accent, 0.14 + 0.12 * Math.sin(t * Math.PI)));
      grad.addColorStop(1, hexToRgba(opts.accent, 0.0));
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
    ctx.strokeStyle = hexToRgba(opts.accent, 0.9);
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
    ctx.fillText(opts.label, cx, cy);

    // DEMO ウォーターマーク（実mp4が無いことを明示）
    ctx.fillStyle = hexToRgba("#ffffff", 0.35);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillText("DEMO (mp4未配置)", cx, cy + 90);

    if (opts.caption) {
      ctx.fillStyle = hexToRgba("#ffffff", 0.7);
      ctx.font = "500 34px system-ui, sans-serif";
      ctx.fillText(opts.caption, cx, h - 120);
    }

    // 進捗バー
    ctx.fillStyle = hexToRgba("#ffffff", 0.15);
    ctx.fillRect(cx - 200, h - 70, 400, 8);
    ctx.fillStyle = hexToRgba(opts.accent, 1);
    ctx.fillRect(cx - 200, h - 70, 400 * t, 8);
  }

  /** 待機中の静止画。 */
  private drawIdle(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    this.canvas.classList.add("is-active");
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.fillBackground(ctx);
    ctx.fillStyle = hexToRgba("#ffffff", 0.25);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 40px system-ui, sans-serif";
    ctx.fillText("READY", w / 2, h / 2);
  }

  private stopPlaceholder(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.placeholderTimer) window.clearTimeout(this.placeholderTimer);
    this.rafId = 0;
    this.placeholderTimer = 0;
  }
}

/**
 * アセットURLの差し替え。
 * `window.__ASSET_MAP__`（{ 元のパス: 差し替え先URL }）があれば適用する。
 * 単一HTMLプレビューでの data URI 埋め込みや、CDN配信への切り替えに使える。
 */
function resolveAssetUrl(src: string): string {
  const map = (globalThis as { __ASSET_MAP__?: Record<string, string> }).__ASSET_MAP__;
  return (map && map[src]) || src;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
