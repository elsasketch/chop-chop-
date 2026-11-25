// 蔬果科普資料：名稱需與抽選池的 name 相同。
const FRUIT_FACTS = {
  蘋果: {
    english: "APPLE",
    image: "apple",
    nutrition: "含有膳食纖維、果膠及維生素 C，吃蘋果有美白效果喔！",
    trivia: "蘋果中有25％的空氣，這就是它們能夠浮在水上的原因。",
  },
  奇異果: {
    english: "KIWI",
    image: "kiwi",
    nutrition: "富含維生素 C，並含有膳食纖維與鉀。",
    trivia: "奇異果放在室溫會慢慢成熟，和蘋果放在一起更容易變軟。",
  },
  西瓜: {
    english: "WATERMELON",
    image: "watermelon",
    nutrition: "水分充足，並含有茄紅素與維生素 A 的前驅物。",
    trivia: "西瓜超過九成都是水分，是夏天常見的水果。",
  },
};

export function createFruitFacts(onReplay, onSeeMore) {
  const get = (id) => document.getElementById(id);
  const score = get("resultScorePanel");
  const panel = get("fruitFactsPanel");
  const replay = get("replayCenter");
  const next = get("btnFactsNext");
  let fruits = [],
    index = 0,
    timer = null;
  // 每次離開結算畫面清除計時器及隱藏卡片。
  function reset() {
    clearTimeout(timer);
    fruits = [];
    index = 0;
    panel.hidden = true;
    panel.inert = true;
    panel.classList.remove("is-revealed", "facts-leaving");
    replay.hidden = true;
    replay.inert = true;
    next.disabled = false;
    score.classList.remove("facts-score-hidden");
    score.inert = true;
  }
  // 依實際抽選順序更新文字與向量插圖，不重新抽選。
  function render() {
    const fruit = fruits[index];
    const facts = FRUIT_FACTS[fruit.name];
    get("factsPage").textContent =
      `${String(index + 1).padStart(2, "0")} / ${String(fruits.length).padStart(2, "0")}`;
    get("factsName").textContent = fruit.name;
    get("factsEnglish").textContent = facts?.english ?? "";
    const image = get("factsImage");
    image.hidden = !facts;
    if (facts) image.src = `img/facts-${facts.image}.svg`;
    else image.removeAttribute("src");
    image.alt = `${fruit.name}剖面插圖`;
    get("factsNutrition").textContent =
      facts?.nutrition ?? "營養資料尚未建立。";
    get("factsTrivia").textContent = facts?.trivia ?? "科普內容尚未建立。";
    [...get("factsDots").children].forEach((dot, i) => {
      dot.hidden = i >= fruits.length;
      dot.classList.toggle("is-current", i === index);
    });
  }
  function start(pickedFruits) {
    if (!pickedFruits.length || !panel.hidden || !replay.hidden) return;
    fruits = pickedFruits.slice();
    index = 0;
    score.inert = true;
    score.classList.add("facts-score-hidden");
    render();
    panel.hidden = false;
    panel.inert = false;
    panel.classList.add("is-revealed");
    next.focus({ preventScroll: true });
  }
  next.addEventListener("click", () => {
    if (panel.inert || next.disabled) return;
    if (index + 1 < fruits.length) {
      index++;
      render();
      return;
    }
    // 最後一頁淡出後，保留裝盤背景，獨立顯示置中按鈕。
    next.disabled = true;
    panel.inert = true;
    panel.classList.add("facts-leaving");
    timer = setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove("is-revealed", "facts-leaving");
      replay.hidden = false;
      replay.inert = false;
      get("btnPlayAgain").focus({ preventScroll: true });
    }, 300);
  });
  get("btnPlayAgain").addEventListener("click", onReplay);
  get("btnReplayMore").addEventListener("click", onSeeMore);
  return { start, reset };
}
