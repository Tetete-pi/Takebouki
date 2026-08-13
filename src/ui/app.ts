import type { DrawResult, GachaManifest } from "../types";
import { drawOnce, validateManifest } from "../core/gacha";
import { defaultRng, type Rng } from "../core/rng";
import { createButtonPullAction, type PullAction } from "./pullAction";
import { VideoStage, type ClipOptions } from "./videoStage";
import { createResultView } from "./resultView";
import { createStatsPanel } from "./statsPanel";
import { BgmPlayer } from "./bgm";

/** 画面フローの状態。 */
type Phase = "idle" | "staging" | "dropping" | "result";

export interface AppOptions {
  manifest: GachaManifest;
  rng?: Rng;
  /** 引くアクションの差し替え用（未指定ならボタン） */
  pullActionFactory?: () => PullAction;
}

/**
 * アプリ全体のオーケストレーション。
 *
 * フロー: idle →(引く)→ staging(演出) →(終了)→ dropping(排出) →(終了)→ result →(もう一度)→ idle
 */
export class GachaApp {
  readonly element: HTMLElement;

  private readonly manifest: GachaManifest;
  private readonly rng: Rng;
  private readonly stage: VideoStage;
  private readonly pullAction: PullAction;
  private readonly resultView = createResultView();
  private readonly stats = createStatsPanel();

  /** 右上のコンプリート表示（同一セッションで入手した種類数 / 全種類数） */
  private readonly completionEl = document.createElement("div");
  /** これまでに入手したアイテムID（同一セッション内で累積、リロードでリセット） */
  private readonly obtained = new Set<string>();

  /** 待機画面の「引く」ボタン用コンテナ（演出中は隠す） */
  private controls: HTMLElement | null = null;

  /** BGM（ボタン押下時に再生開始・ループなし）。manifest.bgm 未指定なら null。 */
  private bgm: BgmPlayer | null = null;

  private phase: Phase = "idle";

  constructor(options: AppOptions) {
    this.manifest = options.manifest;
    this.rng = options.rng ?? defaultRng;

    const errors = validateManifest(this.manifest);
    if (errors.length > 0) {
      this.element = renderConfigErrors(errors);
      // 以降のフィールドはダミー初期化（この分岐では使わない）
      this.stage = new VideoStage();
      this.pullAction = createButtonPullAction();
      return;
    }

    this.stage = new VideoStage();
    this.pullAction = (options.pullActionFactory ?? (() => createButtonPullAction()))();
    this.bgm = this.manifest.bgm ? new BgmPlayer(this.manifest.bgm) : null;

    this.element = this.render();

    this.pullAction.onPull(() => void this.runPull());
    this.resultView.onAgain(() => this.toIdle());

    this.stats.init(this.manifest);
    this.updateCompletion();
    this.toIdle();
  }

  // ---- レンダリング --------------------------------------------------------

  private render(): HTMLElement {
    const root = document.createElement("div");
    root.className = "app";

    const header = document.createElement("header");
    header.className = "app__header";
    header.innerHTML = `<h1 class="app__title">${this.manifest.title}</h1>
      <p class="app__subtitle">単発ガチャ</p>`;

    this.completionEl.className = "completion";

    // 「引く」ボタンは待機画面としてステージ中央にオーバーレイ表示する。
    // 演出/排出中と結果表示中は隠す（toIdle / runPull で制御）。
    const controls = document.createElement("div");
    controls.className = "app__controls";
    controls.append(this.pullAction.element);
    this.controls = controls;

    const stageWrap = document.createElement("div");
    stageWrap.className = "app__stage";
    // コンプリート表示はステージ右上に常時表示（結果表示の上にも出るよう最後に追加）
    stageWrap.append(this.stage.element, controls, this.resultView.element, this.completionEl);

    root.append(header, stageWrap, this.stats.element);
    return root;
  }

  // ---- フロー --------------------------------------------------------------

  private toIdle(): void {
    this.phase = "idle";
    // 「もう一度引く」等で待機に戻るときは BGM をフェードアウトして止める。
    this.bgm?.fadeOut();
    this.resultView.hide();
    this.stage.reset();
    this.pullAction.setEnabled(true);
    if (this.controls) this.controls.hidden = false;
  }

  private async runPull(): Promise<void> {
    if (this.phase !== "idle") return;
    // BGM をこの場（ユーザー操作の実行スタック）で再生開始する。ループなし。
    this.bgm?.start();
    this.pullAction.setEnabled(false);
    if (this.controls) this.controls.hidden = true;
    this.resultView.hide();

    const result = drawOnce(this.manifest, this.rng);

    // 演出 → 排出 をシームレスに連続再生（暗転なし・瞬時切り替え）
    await this.stage.playSequence(
      [this.stagingClip(result), this.dropClip(result)],
      (index) => {
        this.phase = index === 0 ? "staging" : "dropping";
      },
    );

    this.showResult(result);
  }

  /** 演出クリップ（通常/当たり）の設定を組み立てる。 */
  private stagingClip(result: DrawResult): ClipOptions {
    const isHit = result.staging === "hit";
    const file = isHit ? this.manifest.staging.hit : this.manifest.staging.normal;
    return {
      src: `${this.manifest.videoBasePath}/staging/${file}`,
      label: isHit ? "★ CHANCE ★" : "GACHA",
      accent: isHit ? "#ffcc33" : "#4aa3ff",
      placeholderDuration: this.manifest.placeholderDurations.staging,
      caption: isHit ? "当たり演出" : "通常演出",
    };
  }

  /** 排出クリップ（アイテム別）の設定を組み立てる。 */
  private dropClip(result: DrawResult): ClipOptions {
    return {
      src: `${this.manifest.videoBasePath}/drops/${result.item.dropVideo}`,
      label: result.rarity.label,
      accent: result.rarity.color,
      placeholderDuration: this.manifest.placeholderDurations.drop,
      caption: result.item.name,
    };
  }

  private showResult(result: DrawResult): void {
    this.phase = "result";
    this.stage.showResultBadge(result.rarity.label, result.rarity.color);
    this.resultView.show(result);
    this.stats.record(result);
    this.obtained.add(result.item.id);
    this.updateCompletion();
  }

  /** 右上のコンプリート表示を更新する。 */
  private updateCompletion(): void {
    const total = this.manifest.items.length;
    const got = this.obtained.size;
    this.completionEl.innerHTML =
      `<span class="completion__label">コンプ</span>` +
      `<span class="completion__value">${got}<span class="completion__slash">/</span>${total}</span>`;
    this.completionEl.classList.toggle("is-complete", got >= total && total > 0);
  }
}

function renderConfigErrors(errors: string[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "app app--error";
  const list = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  root.innerHTML = `
    <div class="config-error">
      <h1>設定エラー</h1>
      <p>manifest.ts の設定を確認してください。</p>
      <ul>${list}</ul>
    </div>`;
  return root;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
