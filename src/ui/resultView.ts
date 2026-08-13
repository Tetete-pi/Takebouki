import type { DrawResult } from "../types";

/**
 * 排出結果の表示。アイテム名・レア度バッジ・演出種別を出し、
 * 「もう一度引く」ボタンで次の抽選に戻す。
 */
export interface ResultView {
  readonly element: HTMLElement;
  show(result: DrawResult): void;
  hide(): void;
  onAgain(callback: () => void): void;
}

export function createResultView(): ResultView {
  const root = document.createElement("div");
  root.className = "result";
  root.hidden = true;

  const badge = document.createElement("div");
  badge.className = "result__rarity";

  const name = document.createElement("div");
  name.className = "result__name";

  const staging = document.createElement("div");
  staging.className = "result__staging";

  const again = document.createElement("button");
  again.type = "button";
  again.className = "result__again";
  again.textContent = "もう一度引く";

  root.append(badge, name, staging, again);

  let callback: (() => void) | null = null;
  again.addEventListener("click", () => callback?.());

  return {
    element: root,
    show(result) {
      badge.textContent = result.rarity.label;
      badge.style.setProperty("--accent", result.rarity.color);
      name.textContent = result.item.name;
      staging.textContent =
        result.staging === "hit" ? "★ 当たり演出" : "通常演出";
      staging.dataset.staging = result.staging;
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
