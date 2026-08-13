import type { DrawResult, GachaManifest, Rarity } from "../types";
import { computeRarityProbabilities } from "../core/gacha";

/**
 * シミュレーターらしい集計パネル。
 * 引いた回数と、レア度ごとの「実測 vs 理論確率」を表示する。
 */
export interface StatsPanel {
  readonly element: HTMLElement;
  init(manifest: GachaManifest): void;
  record(result: DrawResult): void;
}

export function createStatsPanel(): StatsPanel {
  const root = document.createElement("section");
  root.className = "stats";
  root.hidden = true;

  const heading = document.createElement("div");
  heading.className = "stats__heading";

  const table = document.createElement("div");
  table.className = "stats__table";

  root.append(heading, table);

  let rarities: Rarity[] = [];
  let theoretical = new Map<string, number>();
  const counts = new Map<string, number>();
  let total = 0;

  function renderRows(): void {
    heading.textContent = `抽選結果 — ${total} 回`;
    table.innerHTML = rarities
      .map((r) => {
        const c = counts.get(r.id) ?? 0;
        const actual = total > 0 ? (c / total) * 100 : 0;
        const theory = (theoretical.get(r.id) ?? 0) * 100;
        return `
        <div class="stats__row">
          <span class="stats__badge" style="--accent:${r.color}">${r.label}</span>
          <span class="stats__count">${c}</span>
          <span class="stats__pct">${actual.toFixed(1)}%</span>
          <span class="stats__theory">理論 ${theory.toFixed(1)}%</span>
        </div>`;
      })
      .join("");
  }

  return {
    element: root,
    init(manifest) {
      rarities = manifest.rarities;
      theoretical = computeRarityProbabilities(manifest);
      counts.clear();
      total = 0;
      root.hidden = false;
      renderRows();
    },
    record(result) {
      total += 1;
      counts.set(result.rarity.id, (counts.get(result.rarity.id) ?? 0) + 1);
      renderRows();
    },
  };
}
