/**
 * 「ガチャを引く」アクションのUI。
 *
 * 引く操作（ボタン/レバー/スワイプ等）は未確定なので、共通インターフェース
 * `PullAction` に切り出しておき、実装を差し替えられるようにしている。
 * 別の操作方式にしたいときは、この PullAction を返す factory を新設して
 * app 側で差し替えるだけでよい。
 */
export interface PullAction {
  /** 画面に挿入する要素 */
  readonly element: HTMLElement;
  /** 操作可否の切り替え（演出中は false にする） */
  setEnabled(enabled: boolean): void;
  /** 引く操作が行われたときのコールバック登録 */
  onPull(callback: () => void): void;
  /** 破棄 */
  destroy(): void;
}

/** 既定実装: ボタンを押して引く。 */
export function createButtonPullAction(label = "ガチャを引く"): PullAction {
  const button = document.createElement("button");
  button.className = "pull-button";
  button.type = "button";
  button.innerHTML = `<span class="pull-button__label">${label}</span>`;

  let callback: (() => void) | null = null;

  button.addEventListener("click", () => {
    if (button.disabled) return;
    callback?.();
  });

  return {
    element: button,
    setEnabled(enabled: boolean) {
      button.disabled = !enabled;
    },
    onPull(cb: () => void) {
      callback = cb;
    },
    destroy() {
      callback = null;
      button.remove();
    },
  };
}
