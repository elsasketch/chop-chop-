# CHOP 菜就 CHOP 多多

## 切水果 QTE（新版）

- 點擊菜園一次抽三顆，目前有完整模型的水果只有蘋果，因此會抽到三顆蘋果。
- 點擊 Let's chop! 直接進入 `chopboard.png` 砧板背景場景，第一顆水果從上方落下。
- 指針在綠色區域時按空白鍵、點擊砧板或 Chop! 按鈕，成功後依指針位置即時切割模型。
- 每顆成功切兩刀，三顆完成後顯示總進度；落刀失敗可重試。
- `js/chopGame.js`：QTE、刀具動畫、切割網格、砧板及果肉材質。`CUTS_PER_FRUIT` 可調整每顆刀數，`FRUIT_SCALE` 可調整水果大小。
- `css/style.css` 最下方可調整 QTE 介面位置、大小、提示條樣式。

## 如何在 VS Code 開啟
1. 用 VS Code 開啟這個資料夾（File → Open Folder）
2. 安裝擴充功能「Live Server」
3. 在 `index.html` 上按右鍵 →「Open with Live Server」

> 不能直接雙擊 index.html 開啟，瀏覽器會擋住 3D 模型的載入，一定要透過本機伺服器。

## 檔案說明
- `index.html`：所有畫面的結構
- `css/style.css`：樣式（字體 Dokdo、按鈕、動畫）
- `js/main.js`：畫面流程（主畫面 → 介紹 → 抽選 → 結果）、打字效果、抽選邏輯
- `js/farmScene.js`：3D 場景（鏡頭設定、hover 提示詞、模型顏色）
- `img/`：模型與 logo

## 常改的地方
- hover 提示詞：`js/farmScene.js` 的 `HOTSPOT_RULES`
- 模型顏色：`js/farmScene.js` 的 `MATERIAL_COLORS`
- 每個畫面的鏡頭距離 / 角度：`js/farmScene.js` 的 `CAMERA_PRESETS`
- 可抽到的蔬果：`js/main.js` 的 `FRUIT_POOL`
- 介紹文字：`index.html` 裡 `data-type="..."`

## 蘋果模型
- `img/newapple2.glb` 用於抽選及切割；果肉由 `js/chopGame.js` 的 `this.flesh` 材質和即時網格切割生成，不需要預製切片模型。
