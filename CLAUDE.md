# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · No test runner configured.

## Architecture

This is a Puyo Puyo game. All game logic is kept separate from rendering.

| Path | Role |
|------|------|
| `src/types/puyo.ts` | Core types: `PuyoColor`, `Cell`, `Board`, `Piece`, `GameState` |
| `src/lib/puyoLogic.ts` | Pure functions — no React. Board manipulation, flood-fill grouping, chain resolution, scoring |
| `src/hooks/usePuyoGame.ts` | `useReducer` game state + `setInterval` drop timer + keyboard input |
| `src/components/PuyoGame.tsx` | Renders board, ghost piece, overlays, side panel. `'use client'`. |
| `src/app/page.tsx` | Server component shell — just renders `<PuyoGame />` |

## Key Game Logic

**Piece rotation** — `rotation` (0–3) is the satellite's direction relative to main: 0=up, 1=right, 2=down, 3=left. `getSatellitePos()` converts this to absolute coordinates.

**Chain resolution** — `resolveBoard()` in `puyoLogic.ts` loops synchronously: find groups ≥4 → remove → apply column gravity → repeat. Returns `{ board, chains, poppedTotal }` used for scoring.

**Drop loop** — `useEffect` + `setInterval` dispatches `TICK` every `dropInterval(level)` ms. When a piece can't move down, the reducer calls `landPiece()` inline — chain resolution happens synchronously inside the reducer.

**Ghost piece** — `getGhostPiece()` drops a copy of the current piece until it would collide, rendered as dashed outlines.

**Scoring** — `calcScore(poppedTotal, chains, level)` uses chain multipliers `[0,0,8,16,32,64,96,128,160,192]`.

## Tailwind v4 Notes

No `tailwind.config.js` — configuration via `@theme` block in `globals.css`. Dynamic colors (puyo colors) use inline styles, not Tailwind classes.

---

## ぷよぷよ 要件定義

### 1. ゲーム概要

6列×12行のフィールドに2個1組の「ぷよ」を落とし、同色のぷよを4個以上連結させて消すパズルゲーム。連鎖（チェーン）を重ねるほど高得点になる。

---

### 2. フィールド仕様

| 項目 | 値 |
|------|----|
| 列数 (`COLS`) | 6 |
| 行数 (`ROWS`) | 12 |
| セルサイズ | 46×46 px |
| フィールドサイズ | 276×552 px（gap 1px 含む） |

- 行インデックス 0 が最上行、11 が最下行
- y < 0 はフィールド外上部（ぷよが出現する際に衛星ぷよが一時的に占める領域）

---

### 3. ぷよ仕様

#### 3.1 色の種類

`red` / `blue` / `green` / `yellow` / `purple` の5色。出現色はランダム（均等確率）。

#### 3.2 外観

- 円形（`border-radius: 50%`）
- 色ごとに放射状グラデーション＋発光エフェクト（`box-shadow` glow）
- 目のデザイン（黒円2個＋白ハイライト2個）をCSS絶対配置で表現

#### 3.3 ゴーストぷよ

現在のピースが最終的に着地する位置を破線円で表示する。色は現在ピースと同色、透明度45%。`getGhostPiece()` がボードを走査して算出。

---

### 4. ピース仕様

1ピース = **メインぷよ**（操作基点）+ **サテライトぷよ**（メインの周囲1マス）の2個1組。

#### 4.1 サテライト方向（`rotation`）

| rotation | サテライトの位置 |
|----------|----------------|
| 0 | メインの上（`y-1`） |
| 1 | メインの右（`x+1`） |
| 2 | メインの下（`y+1`） |
| 3 | メインの左（`x-1`） |

#### 4.2 出現位置

- メイン: 列2、行0
- サテライト: 列2、行-1（フィールド外上部）
- `rotation` の初期値: 0（サテライトが上）

#### 4.3 NEXTぷよ

次に出現するピースの色の組み合わせを1組サイドパネルに表示する。

---

### 5. 操作仕様

#### 5.1 キーボード

| キー | 操作 |
|------|------|
| `←` | 左移動 |
| `→` | 右移動 |
| `↓` | ソフトドロップ（1マス落下） |
| `Space` | ハードドロップ（即座に着地） |
| `Z` / `↑` | 左回転（反時計回り、`dir: -1`） |
| `X` | 右回転（時計回り、`dir: 1`） |
| `Enter` | スタート / リスタート（idle/gameover 時） |

#### 5.2 モバイルボタン

ゲームプレイ中（`phase === 'falling'`）のみ表示。3×2グリッド配置。
- 上行: 左回転（↺）/ ハードドロップ（↑）/ 右回転（↻）
- 下行: 左移動（←）/ ソフトドロップ（↓）/ 右移動（→）
- `onPointerDown` で反応（タップ・クリック両対応）

---

### 6. 移動・回転ルール

#### 6.1 移動

- 左右移動はフィールド境界またはぷよが存在する場合に阻止
- ソフトドロップ・ハードドロップ中も左右移動可能
- 移動可否は `isPieceValid(board, movedPiece)` で判定

#### 6.2 回転（ウォールキック付き）

`tryRotate()` の処理順:
1. 単純回転を試みる
2. 失敗した場合、`x-1` にオフセットして再試行
3. 失敗した場合、`x+1` にオフセットして再試行
4. すべて失敗した場合、回転しない（元のピースを返す）

---

### 7. 落下・着地ルール

- 自動落下は `setInterval` で `dropInterval(level)` ms ごとに `TICK` アクションを発火
- ピースが1マスも下に移動できない状態で `TICK` / `SOFT_DROP` が来ると着地処理（`landPiece()`）を実行
- ハードドロップは着地可能な最下位置まで瞬時に移動してから着地

#### 落下速度

```
dropInterval(level) = max(80, 550 - (level - 1) × 50)  [ms]
```

| レベル | インターバル |
|-------|------------|
| 1 | 550 ms |
| 5 | 350 ms |
| 10 | 100 ms |
| 10以上 | 80 ms（下限） |

---

### 8. 消去・連鎖ルール

着地後、`resolveBoard()` が同期的に以下のループを実行する。

1. **グループ検出**: `findConnectedGroups()` がフラッドフィルで同色連結グループを列挙
2. **消去判定**: `findPops()` が4個以上のグループのセルを消去対象に選定
3. **消去**: 対象セルを `null` に置換
4. **重力適用**: `applyGravity()` が各列を下詰めに再配置
5. **繰り返し**: 消去対象が0になるまでループ（= 連鎖処理）

連鎖は1着地ごとにカウントリセット。結果として得られる `chains` と `poppedTotal` をスコア計算に使用。

---

### 9. スコア計算

```
score += poppedTotal × 10 × (chainBonus + 1) × level
```

#### チェーンボーナス対応表

| 連鎖数 | bonus |
|--------|-------|
| 1 | 0 |
| 2 | 8 |
| 3 | 16 |
| 4 | 32 |
| 5 | 64 |
| 6 | 96 |
| 7 | 128 |
| 8 | 160 |
| 9以上 | 192 |

---

### 10. レベルシステム

```
level = floor(totalPopped / 20) + 1
```

- `totalPopped`: ゲーム開始からの累計消去ぷよ数
- 20個消去ごとにレベルアップ
- レベルアップは落下速度の上昇とスコア倍率の増加を伴う

---

### 11. ゲームオーバー条件

着地処理後のボードで以下を満たす場合にゲームオーバー（`isGameOver(board)`）:

```
board[0][2] !== null  OR  board[0][3] !== null
```

出現列（列2）の最上行が埋まっていると次のピースが出現できないと判定する。

---

### 12. ゲーム状態遷移

```
idle ──[START]──► falling ──[着地]──► falling（連鎖解決後に次ピース出現）
                                  └──[ゲームオーバー条件]──► gameover
gameover ──[START]──► falling
```

| フェーズ | 説明 |
|---------|------|
| `idle` | 初期画面。スタートオーバーレイを表示 |
| `falling` | ゲームプレイ中。自動落下タイマー稼働 |
| `gameover` | ゲームオーバー画面。スコアと最大連鎖数を表示 |

---

### 13. UI仕様

#### 13.1 レイアウト

- 画面中央に横並びで「ゲームボード」＋「サイドパネル」を配置
- 背景: `bg-gray-950`（`#030712`）

#### 13.2 サイドパネル表示項目

| 項目 | 説明 |
|------|------|
| SCORE | 累計スコア（カンマ区切り） |
| LEVEL | 現在レベル |
| CHAIN | 直前着地の連鎖数（0のとき非表示） |
| MAX CHAIN | ゲーム中の最大連鎖数 |
| NEXT | 次ピースの2色を縦に表示 |

#### 13.3 オーバーレイ

- **スタートオーバーレイ** (`idle`): タイトル・キー操作説明・スタートボタン
- **ゲームオーバーオーバーレイ** (`gameover`): スコア・最大連鎖数・リスタートボタン

---

### 14. 実装済み拡張機能

| 項目 | 実装内容 |
|------|----------|
| ポップアニメーション | `puyo-popping` CSS クラス（`@keyframes puyo-pop` 0.42s）。`GamePhase` に `'popping'` を追加し、`popGen` の変化で `useEffect` が `POP_ANIM_MS=420ms` 後に `EXECUTE_POP` を発火。連鎖はフェーズをまたいで継続。 |
| BGM・SE | `src/lib/sounds.ts`：Web Audio API 合成音。移動・回転・着地・ハードドロップ・ポップ（連鎖数に応じた音程変化）・ゲームオーバー。初回ユーザー操作時に `enableSounds()` で AudioContext を起動（自動再生ポリシー対応）。 |
| ハイスコア永続化 | `src/hooks/useHighScore.ts`：`localStorage` キー `puyo-highscore` に保存。ゲームオーバー時に自動更新。スタート画面・サイドパネル・ゲームオーバー画面に表示。NEW RECORD! 表示あり。 |
| ポーズ機能 | `P` キーまたはサイドパネルボタンでトグル。`paused: boolean` が `true` の間、落下インターバル・ポップタイマーともに停止。`falling` / `popping` フェーズ中のみ有効。 |
| スワイプ操作 | `PuyoGame` 内 `useEffect` でタッチイベントを処理。横スワイプ → 左右移動、上スワイプ → 右回転、下スワイプ（200ms以内）→ ハードドロップ、下スワイプ（200ms以上）→ ソフトドロップ。最小移動距離 25px。 |
| 落下スタイル改善 | チェッカー模様のボード背景（透明度差）、グラデーション背景。チェーン数パネルに `chain-flash` アニメーション。 |

### 15. 未実装項目（今後の拡張候補）

| 項目 | 概要 |
|------|------|
| 落下アニメーション | ぷよが滑らかに落ちる CSS transition（グリッド外のピース専用レイヤーが必要） |
| 対戦モード | おじゃまぷよを使ったCPU/2P対戦 |
| おじゃまぷよ | 連鎖時に相手フィールドへ送るぷよ |
