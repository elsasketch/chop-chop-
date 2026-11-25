// ===================================================
// main.js：畫面流程控制
// 載入 → 主畫面 → 遊戲介紹 → 抽選蔬果 → 抽選結果
// ===================================================
import { FarmScene } from "./farmScene.js";
import { ChopGame } from "./chopGame.js";
import { createFruitFacts } from "./fruitFacts.js";

// 可以抽到的蔬果（名稱需與 chopGame.js 的 FRUIT_TYPES 相同，之後有新模型再加進來）
const FRUIT_POOL = [
  { name: "蘋果", model: "img/newapple2.glb" },
  { name: "西瓜", model: "img/watermelon_whole_baked.glb" },
];
// 抽選時輪播的名字（純粹好玩用）
const SHUFFLE_NAMES = [
  "玉米",
  "番茄",
  "高麗菜",
  "紅蘿蔔",
  "洋蔥",
  "小麥",
  "蘋果",
  "西瓜",
];

// 打字效果每個字的間隔（毫秒）
const TYPING_SPEED = 70;

// ---------- 取得畫面元素 ----------
const body = document.body;
const screens = {
  loading: document.getElementById("screenLoading"),
  home: document.getElementById("screenHome"),
  intro: document.getElementById("screenIntro"),
  pick: document.getElementById("screenPick"),
  chop: document.getElementById("screenChop"),
  result: document.getElementById("screenResult"),
};
const loadingBarFill = document.getElementById("loadingBarFill");
const loadingText = document.getElementById("loadingText");
const introBox = document.getElementById("introBox");
const introParagraphs = [...document.querySelectorAll(".intro-text")];
const hoverTip = document.getElementById("hoverTip");
const toast = document.getElementById("toast");
const checkButton = document.getElementById("btnCheck");
const cornerLogo = document.getElementById("cornerLogo");

// ---------- 3D 場景 ----------
const farmScene = new FarmScene(document.getElementById("farmCanvas"));
const chopGame = new ChopGame(document.getElementById("chopCanvas"), () => showScreen("home"), () => showScreen("result"));

// 目前狀態
let currentScreen = "loading";
let pickedFruits = []; // 一次抽出的三顆水果
let drawToken = 0; // 避免離開抽選畫面後舊計時器繼續執行
let isDrawing = false; // 是否正在抽選中
let typingTimer = null; // 打字效果計時器
let toastTimer = null;

// 結算後的蔬果科普頁（Next Page 進入，最後顯示 Play Again / See More）
const fruitFacts = createFruitFacts(
  () => showScreen("home"),
  () => showScreen("pick"),
);

// ---------- 切換畫面 ----------
function showScreen(screenName) {
  // 離開結算或重新進入時清除上一局科普頁狀態
  if (currentScreen === "result" || screenName === "result") fruitFacts.reset();
  if (["chop", "result"].includes(currentScreen) && !["chop", "result"].includes(screenName)) chopGame.stop();
  drawToken++;
  isDrawing = false;
  clearTimeout(toastTimer);
  toast.classList.remove("is-visible");
  currentScreen = screenName;
  body.dataset.screen = screenName;
  Object.entries(screens).forEach(([name, element]) => {
    element.classList.toggle("is-active", name === screenName);
  });
  if (screenName !== "loading" && screenName !== "chop" && screenName !== "result") farmScene.setMode(screenName);
  if (screenName === "chop") farmScene.setHoveredHotspot(null);

  // 離開介紹畫面就停止打字
  if (screenName === "intro") {
    startTyping();
  } else {
    stopTyping();
  }

  // 進入抽選畫面時重設狀態
  if (screenName === "pick") {
    pickedFruits = [];
    checkButton.disabled = true;
    checkButton.classList.remove("is-ready");
  }

  hideHoverTip();
}

// ---------- 打字效果 ----------
function startTyping() {
  stopTyping();
  introParagraphs.forEach((paragraph) => {
    paragraph.textContent = "";
    paragraph.classList.remove("is-typing");
  });

  let paragraphIndex = 0;
  let charIndex = 0;

  // 等介紹框滑進來之後才開始打字
  typingTimer = setTimeout(function typeNextChar() {
    const paragraph = introParagraphs[paragraphIndex];
    if (!paragraph) return; // 全部打完
    const fullText = paragraph.dataset.type;

    paragraph.classList.add("is-typing");
    paragraph.textContent = fullText.slice(0, charIndex + 1);
    charIndex += 1;

    if (charIndex >= fullText.length) {
      // 這段打完，換下一段
      paragraph.classList.remove("is-typing");
      paragraphIndex += 1;
      charIndex = 0;
      typingTimer = setTimeout(typeNextChar, 400);
    } else {
      // 遇到標點符號停頓久一點，比較像真的在打字
      const pause = /[，。！、]/.test(fullText[charIndex - 1])
        ? TYPING_SPEED * 4
        : TYPING_SPEED;
      typingTimer = setTimeout(typeNextChar, pause);
    }
  }, 900);
}

function stopTyping() {
  clearTimeout(typingTimer);
  typingTimer = null;
}

// 點擊介紹框可以直接顯示全部文字
function finishTyping() {
  stopTyping();
  introParagraphs.forEach((paragraph) => {
    paragraph.textContent = paragraph.dataset.type;
    paragraph.classList.remove("is-typing");
  });
}

// ---------- hover 提示詞 ----------
farmScene.onHoverChange = (rule) => {
  if (rule) {
    hoverTip.textContent = rule.text;
    hoverTip.classList.add("is-visible");
  } else {
    hideHoverTip();
  }
};

function hideHoverTip() {
  hoverTip.classList.remove("is-visible");
}

// 每一幀讓提示詞跟著物件移動
function followHoverTarget() {
  const position = farmScene.getHoveredScreenPosition();
  if (position) {
    // 限制在畫面範圍內，避免高的物件（例如樹）提示詞跑出畫面
    const halfWidth = hoverTip.offsetWidth / 2 + 12;
    const x = Math.min(
      Math.max(position.x, halfWidth),
      window.innerWidth - halfWidth,
    );
    const y = Math.max(position.y - 14, hoverTip.offsetHeight + 16);
    hoverTip.style.left = `${x}px`;
    hoverTip.style.top = `${y}px`;
  }
  requestAnimationFrame(followHoverTarget);
}
followHoverTarget();

// ---------- 提示訊息 ----------
function showToast(html, duration = 2200) {
  clearTimeout(toastTimer);
  toast.innerHTML = html;
  toast.classList.add("is-visible");
  if (duration > 0) {
    toastTimer = setTimeout(
      () => toast.classList.remove("is-visible"),
      duration,
    );
  }
}

// ---------- 抽選蔬果 ----------
farmScene.onPick = () => {
  if (isDrawing || currentScreen !== "pick") return;
  isDrawing = true;
  checkButton.disabled = true;
  checkButton.classList.remove("is-ready");

  // 名字快速輪播，越來越慢，最後停在抽到的蔬果
  const drawId = ++drawToken;
  const results = Array.from({ length: 3 }, () => FRUIT_POOL[Math.floor(Math.random() * FRUIT_POOL.length)]);
  let step = 0;
  const totalSteps = 14;

  function shuffleStep() {
    if (drawId !== drawToken || currentScreen !== "pick") return;
    const isLast = step >= totalSteps;
    const name = isLast
      ? results.map((fruit) => fruit.name).join("、")
      : SHUFFLE_NAMES[step % SHUFFLE_NAMES.length];
    if (isLast) {
      showToast(`抽到了三顆：<strong>${name}</strong>！按 Let's chop!`, 3200);
      pickedFruits = results;
      isDrawing = false;
      checkButton.disabled = false;
      checkButton.classList.add("is-ready");
      return;
    }
    showToast(`抽選中… ${name}`, 0);
    step += 1;
    setTimeout(shuffleStep, 60 + step * step * 1.5);
  }
  shuffleStep();
};

// ---------- 按鈕事件 ----------
document
  .getElementById("btnHomeFarm")
  .addEventListener("click", () => showScreen("intro"));
document
  .getElementById("btnHomeMore")
  .addEventListener("click", () => showScreen("pick"));
document
  .getElementById("btnIntroFarm")
  .addEventListener("click", () => showScreen("pick"));
introBox.addEventListener("click", finishTyping);

checkButton.addEventListener("click", () => {
  if (pickedFruits.length !== 3) return;
  showScreen("chop");
  chopGame.start(pickedFruits);
});

// 結算計分板的 Next Page：依抽到的順序顯示蔬果科普
document
  .getElementById("btnResultReplay")
  .addEventListener("click", () => fruitFacts.start(pickedFruits));

// 點右上角 logo 回主畫面
cornerLogo.addEventListener("click", () => showScreen("home"));

// ---------- 開始載入 ----------
showScreen("loading");
farmScene
  .loadModels("img/farm_diorama.glb", "img/newapple2.glb", (progress) => {
    const percent = Math.round(progress * 100);
    loadingBarFill.style.width = `${percent}%`;
    loadingText.textContent = `農場準備中… ${percent}%`;
  })
  .then(() => {
    // 稍等一下讓進度條跑滿再進主畫面
    setTimeout(() => showScreen("home"), 400);
  })
  .catch((error) => {
    console.error(error);
    loadingText.textContent =
      "模型載入失敗，請用本機伺服器開啟（例如 VS Code Live Server）";
  });
