# Takebouki Gacha

ブラウザで動く**単発ガチャシミュレーター**。

**引く → 演出動画 → 排出動画 → 結果表示** の流れを、用意した mp4 を差し込むだけで
再生できます。動画がまだ無い状態でも、canvas のプレースホルダ演出に自動フォール
バックするので全フローを確認できます。

## フロー

```
[ガチャを引く] ──▶ 演出動画（通常 or 当たり） ──▶ 排出動画（アイテム別） ──▶ 結果表示 ──▶ もう一度
```

## 抽選ロジック（排出先に決める方式）

1. `items` の `weight` による重み付き抽選で **排出アイテム** を1つ決定
2. そのアイテムの **レア度（`rarity`）が持つ `staging`（`normal` / `hit`）** で
   再生する **演出動画** が決まる
3. 演出動画 → そのアイテムの排出動画、の順で再生

つまり「先に何が出るか」を決め、そのレア度に応じて通常演出／当たり演出が流れます。

## セットアップ

```bash
npm install
npm run dev      # 開発サーバ（http://localhost:5173）
npm run build    # 型チェック + 本番ビルド（dist/）
npm run preview  # ビルド結果のプレビュー
```

## 設定を変える（`src/config/manifest.ts`）

ラインナップ・確率・動画ファイル名はすべてここで一元管理します。

- `rarities` … レア度と、その `staging`（通常/当たり）を定義
- `items` … 排出アイテム（= 排出動画の本数）。`weight` が確率、`dropVideo` が動画名
- `staging` … 演出動画2種類（`normal` / `hit`）のファイル名
- `placeholderDurations` … 実mp4が無いときのプレースホルダ演出の尺（秒）

## 動画アセットの配置

`public/assets/videos/` 配下に置きます。詳細は
[`public/assets/videos/README.md`](public/assets/videos/README.md) を参照。

```
public/assets/videos/
├── staging/            # 演出動画（2種類）
│   ├── staging_normal.mp4
│   └── staging_hit.mp4
└── drops/              # 排出動画（ラインナップの数だけ）
    ├── n_01.mp4
    ├── ...
    └── ssr_01.mp4
```

ファイル名を `manifest.ts` と一致させれば、プレースホルダから実動画へ自動で
切り替わります。

## 構成

```
src/
├── main.ts                 エントリポイント
├── style.css               スタイル
├── types.ts                型定義
├── config/manifest.ts      ★ ガチャ設定（ここを編集）
├── core/
│   ├── gacha.ts            抽選ロジック・確率計算・設定バリデーション
│   └── rng.ts              乱数（seed 指定で再現も可能）
└── ui/
    ├── app.ts              フロー全体のオーケストレーション
    ├── pullAction.ts       「引く」操作（差し替え可能なインターフェース）
    ├── videoStage.ts       動画再生 + プレースホルダ演出フォールバック
    ├── resultView.ts       排出結果の表示
    └── statsPanel.ts       実測 vs 理論確率の集計
```

### 「引く」操作の差し替え

引く操作は `PullAction` インターフェース（`src/ui/pullAction.ts`）に切り出して
あります。既定はボタン（`createButtonPullAction`）。レバーを回す等の別方式にする
場合は、同じインターフェースを返す factory を実装し、`GachaApp` の
`pullActionFactory` に渡すだけで差し替えられます。
