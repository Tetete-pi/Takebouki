/**
 * 排出後の表示。
 *
 * アイテム名・レア度は排出動画自体に含まれるため、ここでは「もう一度引く」
 * ボタンだけを表示する（動画の最終フレームの上に重ねる）。
 */
export interface ResultView {
  readonly element: HTMLElement;
  show(): void;
  hide(): void;
  onAgain(callback: () => void): void;
}

export function createResultView(): ResultView {
  const root = document.createElement("div");
  root.className = "result";
  root.hidden = true;

  const again = document.createElement("button");
  again.type = "button";
  again.className = "result__again";
  again.textContent = "もう一度引く";

  root.append(again);

  let callback: (() => void) | null = null;
  again.addEventListener("click", () => callback?.());

  return {
    element: root,
    show() {
      root.hidden = false;
      // 再アニメーション用にクラスを付け直す
      root.classList.remove("is-in");
      void root.offsetWidth;
      root.classList.add("is-in");
    },
    hide() {
      root.hidden = true;
    },
    onAgain(cb) {
      callback = cb;
    },
  };
}
