// ===================================================
// farmScene.js：負責所有 3D 相關的東西
// （農場模型、蘋果模型、鏡頭運鏡、滑鼠拖曳旋轉、hover 偵測）
// ===================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// 每個畫面的鏡頭設定
// distance：鏡頭離農場中心的距離（越大農場越小）
// fov：垂直視角（越小模型越大，預設 35 度）
// polarAngle：鏡頭俯角（弧度，越小越從上往下看）
// azimuthAngle：首頁固定的水平角度（弧度）
// shiftX：畫面水平偏移（負數 = 農場往右邊擺）
// targetY：鏡頭看向的高度
// rotateSpeed：自動旋轉速度
const CAMERA_PRESETS = {
  home: {
    distance: 5,
    polarAngle: 1.49,
    azimuthAngle: 0.9,
    shiftX: 0.02,
    targetY: 1.8,
    rotateSpeed: 0,
    fov: 60,
  },
  intro: {
    distance: 9.5,
    polarAngle: 1.2,
    shiftX: 0.0,
    targetY: 1.0,
    rotateSpeed: 0.4,
  },
  pick: {
    distance: 15,
    polarAngle: 1.08,
    azimuthAngle: 0,
    shiftX: 0.04,
    targetY: 2.0,
    rotateSpeed: 1.1,
    fov: 35,
  },
  fruit: {
    distance: 16,
    polarAngle: 1.1,
    shiftX: 0.04,
    targetY: 1.0,
    rotateSpeed: 0.3,
  },
};

// hover 提示詞規則：用物件名稱比對
// text：顯示的提示詞；pickable：點擊後可以抽選蔬果
const HOTSPOT_RULES = [
  { pattern: /AppleTree/, text: "牛頓的最愛", pickable: true },
  { pattern: /Gnome/, text: "早安午安晚安", pickable: false },
  {
    pattern: /^Water_Block|^Water_LilyPads/,
    text: "魚不能切！",
    pickable: false,
  },
  { pattern: /Beehive/, text: "嗡嗡～蜜蜂也不能切", pickable: false },
  { pattern: /Wheelbarrow/, text: "戴蛙鏡切洋蔥不會流眼淚！", pickable: true },
  {
    pattern: /Lantern|JarCandle/,
    text: "沒有燈嗎，我幫你點燈～",
    pickable: false,
  },
  { pattern: /WateringCan/, text: "澆水才會快快長大", pickable: false },
  { pattern: /Crop_Corn/, text: "玉米開花是爆米花嗎？", pickable: true },
  { pattern: /Crop_Tomato/, text: "番茄是google!", pickable: true },
  { pattern: /Crop_Cabbage/, text: "你要不要吃～哈密瓜～", pickable: true },
  {
    pattern: /Crop_Carrot|Barrel_Carrots/,
    text: "嘿喲嘿喲～拔蘿蔔～",
    pickable: true,
  },
  { pattern: /Crop_Wheat/, text: "麥香紅茶", pickable: true },
  { pattern: /Tile_Soil/, text: "月底吃土囉", pickable: true },
  { pattern: /Pottery_Jar|Sacks/, text: "存糧滿滿", pickable: false },
  { pattern: /Fence/, text: "請勿翻越", pickable: false },
  { pattern: /Barrel_Flowers/, text: "花不能吃喔", pickable: false },
  {
    pattern: /Crop_Watermelon/,
    text: "西瓜也可以切！",
    pickable: true,
  },
  {
    pattern: /^Tile_Grass_r0c/,
    text: "今天也是美好的一天",
    pickable: false,
  },
  {
    pattern: /^Tile_Grass_r1c/,
    text: "窮到只能吃草",
    pickable: false,
  },
  {
    pattern: /^Tile_Grass_r2c/,
    text: "這裡藏著什麼秘密？",
    pickable: false,
  },
  {
    pattern: /^Tile_Grass/,
    text: "叫你點菜你再點草：）",
    pickable: false,
  },
  {
    pattern: /Cow/i,
    text: "哞～天天吃草！",
    pickable: false,
  },
];

// Blender 程序材質匯出成 glb 時會遺失顏色，這裡依材質名稱補上顏色
const MATERIAL_COLORS = {
  MAT_Apple: 0xe5352f,
  MAT_Cabbage: 0xa9d17a,
  MAT_Cabbage_Inner: 0xe0eeb0,
  MAT_Carrot: 0xf07a22,
  MAT_Corn: 0xf2c230,
  MAT_Grass: 0x9fd44a,
  MAT_Grass_Tuft: 0x86c23c,
  MAT_Hive_Wood: 0xc9a066,
  MAT_Leaf: 0x4f9a3a,
  MAT_Leaf_Autumn: 0xd9823b,
  MAT_Leaf_Fresh: 0x7cc24a,
  MAT_LilyPad: 0x7fb24a,
  MAT_Metal_Dark: 0x2f2f33,
  MAT_Metal_Muted: 0x7c8a86,
  MAT_Metal_Rust: 0x9a5a3a,
  MAT_Onion: 0xc58ac9,
  MAT_Riverbed: 0x9cc8d6,
  MAT_Sack_Tan: 0xd6b98a,
  MAT_Soil: 0x8a5232,
  MAT_Soil_Side: 0x7a4a2c,
  MAT_Terracotta: 0xd08a62,
  MAT_Tomato: 0xe8412f,
  MAT_Tree_Foliage: 0x6fae32,
  MAT_Wheat: 0xd9b560,
  MAT_Wheat_Stalk: 0xb9a05a,
  MAT_Wood: 0x8b5a34,
  MAT_Wood_Bark: 0x6b4428,
  MAT_Wood_Light: 0xb98a5a,
  MAT_Wood_Seam: 0x4a3020,
};

// 幫材質補顏色（名稱後面的 .001 之類會先去掉）
function applyMaterialColor(material) {
  const baseName = material.name.replace(/\.\d+$/, "");

  // 有頂點色或貼圖（土、草）的材質：顏色已經在 glb 裡，不能再染色，否則會變暗。保留 glb 內的 baseColor（花瓣、水壺、袋子等純色材質靠它顯色），不要覆蓋
  if (
    !material.vertexColors &&
    !material.map &&
    material.color &&
    material.color.getHex() === 0xffffff
  ) {
    const colorHex = MATERIAL_COLORS[baseName];
    if (colorHex !== undefined) material.color.set(colorHex);
  }

  // 金屬在沒有環境反射的畫面會很黑，壓低金屬度、保留一點反射
  if (material.metalness !== undefined) {
    material.metalness = Math.min(material.metalness, 0.15);
    material.envMapIntensity = 0.6;
  }

  // 水：原本是白色半透明，改成淡藍色，並關掉深度寫入避免透明物件互相遮擋出現雜點
  if (baseName === "MAT_Water") {
    material.color.set(0x8fd0e6);
    material.opacity = 0.6;
    material.depthWrite = false;
  }
}

// 不參與滑鼠偵測的物件（飄浮的葉子之類，會擋到後面的東西）
const IGNORE_PATTERN = /Leaf_|Wind/;

// 緩動函式
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class FarmScene {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.clock = new THREE.Clock();
    this.mode = "home";

    // 外部可以設定的事件
    this.onHoverChange = () => {}; // hover 物件改變時（傳入提示詞或 null）
    this.onPick = () => {}; // 點擊可抽選物件時

    this.hoveredHotspot = null; // 目前 hover 的物件
    this.pointerNdc = new THREE.Vector2(9, 9); // 滑鼠位置（-1 ~ 1）
    this.pointerInside = false;
    this.isDragging = false;
    this.pointerDownPosition = null;

    this.raycastTargets = []; // 可以被滑鼠偵測的 mesh
    this.floatingLeaves = []; // 會飄動的葉子
    this.gnomeWalker = null; // 小矮人在左前方草地散步的狀態
    this.gnomeHotspot = null; // 走動時同步更新提示詞位置
    this.fruitApples = []; // 結果畫面的蘋果
    this.appleTemplate = null;

    this.currentShiftX = CAMERA_PRESETS.home.shiftX;
    this.cameraTween = null;
    this.homeSwayStart = 0;

    this.setupRenderer();
    this.setupScene();
    this.setupControls();
    this.setupPointerEvents();

    window.addEventListener("resize", () => this.handleResize());
    this.handleResize();
    this.renderer.setAnimationLoop(() => this.renderFrame());
  }

  // ---------- 初始化 ----------

  // 建立渲染器
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0); // 透明背景，讓 CSS 漸層透出來
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // 建立場景、燈光與陰影地板
  setupScene() {
    this.scene = new THREE.Scene();

    // 環境光貼圖，讓模型材質（PBR）看起來比較自然
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_PRESETS.home.fov,
      1,
      0.1,
      200,
    );
    this.scene.add(this.camera); // 把鏡頭加進場景，蘋果才能掛在鏡頭上

    // 天空光（上方偏暖、下方偏綠）
    const hemisphereLight = new THREE.HemisphereLight(0xfffbea, 0xb7c79a, 0.9);
    this.scene.add(hemisphereLight);

    // 主光源（產生陰影）
    const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.9);
    sunLight.position.set(-6, 10, 6);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);

    sunLight.shadow.camera.left = -9;
    sunLight.shadow.camera.right = 9;
    sunLight.shadow.camera.top = 9;
    sunLight.shadow.camera.bottom = -9;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 40;

    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.camera.updateProjectionMatrix();

    this.scene.add(sunLight);

    // 鏡頭前方的補光，讓蘋果比較亮
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(0, 2, 6);
    this.camera.add(fillLight);

    // 接收陰影的透明地板
    const shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    );
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    this.shadowFloor = shadowFloor;
    this.scene.add(shadowFloor);

    // 農場的容器
    this.farmGroup = new THREE.Group();
    this.scene.add(this.farmGroup);

    // 結果畫面的蘋果容器（掛在鏡頭上，永遠在畫面前方）
    this.fruitGroup = new THREE.Group();
    this.fruitGroup.visible = false;
    this.camera.add(this.fruitGroup);
  }

  // 建立滑鼠拖曳旋轉控制
  setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableRotate = false; // 只有抽選畫面才能拖曳
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = CAMERA_PRESETS.home.rotateSpeed;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 1.55;

    // 一開始的鏡頭位置
    const preset = CAMERA_PRESETS.home;
    this.controls.target.set(0, preset.targetY, 0);
    const startDirection = new THREE.Spherical(
      preset.distance,
      preset.polarAngle,
      preset.azimuthAngle,
    );
    this.camera.position
      .setFromSpherical(startDirection)
      .add(this.controls.target);
    this.controls.update();

    this.controls.addEventListener("start", () => {
      this.isDragging = true;
      this.canvas.classList.add("is-dragging");
    });
    this.controls.addEventListener("end", () => {
      this.isDragging = false;
      this.canvas.classList.remove("is-dragging");
    });
  }

  // 滑鼠移動、點擊事件
  setupPointerEvents() {
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerInside = true;
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointerInside = false;
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      this.pointerDownPosition = { x: event.clientX, y: event.clientY };
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.pointerDownPosition) return;
      // 移動距離很小才算「點擊」，避免拖曳旋轉時誤觸
      const movedDistance = Math.hypot(
        event.clientX - this.pointerDownPosition.x,
        event.clientY - this.pointerDownPosition.y,
      );
      this.pointerDownPosition = null;
      if (movedDistance > 6 || this.mode !== "pick") return;

      // 觸控裝置沒有 hover，所以點擊時重新偵測一次
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const hotspot = this.findHotspotUnderPointer();
      this.setHoveredHotspot(hotspot);
      if (this.isPointerOverFarm()) {
        this.onPick(hotspot);
      }
    });
  }

  // ---------- 載入模型 ----------

  // 載入農場與蘋果模型，onProgress 會收到 0~1 的進度
  async loadModels(farmUrl, appleUrl, onProgress) {
    const loader = new GLTFLoader();
    const progressByFile = { farm: 0, apple: 0 };
    const weights = { farm: 0.9, apple: 0.1 }; // 農場檔案比較大，進度比重高
    const reportProgress = () => {
      onProgress(
        progressByFile.farm * weights.farm +
          progressByFile.apple * weights.apple,
      );
    };
    const loadOne = (url, key) =>
      loader.loadAsync(url, (xhr) => {
        if (xhr.total) {
          progressByFile[key] = xhr.loaded / xhr.total;
          reportProgress();
        }
      });

    const [farmGltf, appleGltf] = await Promise.all([
      loadOne(farmUrl, "farm"),
      loadOne(appleUrl, "apple"),
    ]);
    onProgress(1);

    this.prepareFarm(farmGltf.scene);
    this.prepareApple(appleGltf.scene);
  }

  // 整理農場模型：置中、陰影、hover 規則
  prepareFarm(farmModel) {
    // Blender 輔助用的平面先隱藏
    farmModel.traverse((object) => {
      if (object.name === "Plane") object.visible = false;
    });

    // 把模型放到中心、底部貼齊地板
    // （計算大小時排除飄在遠處的葉子，不然中心會跑掉）
    const box = new THREE.Box3();
    farmModel.updateMatrixWorld(true);
    farmModel.traverse((object) => {
      if (
        object.isMesh &&
        object.visible &&
        !this.hasIgnoredAncestor(object) &&
        !/Plane/.test(object.name)
      ) {
        box.expandByObject(object);
      }
    });
    const center = box.getCenter(new THREE.Vector3());
    farmModel.position.x -= center.x;
    farmModel.position.z -= center.z;
    farmModel.position.y -= box.min.y;
    this.farmGroup.add(farmModel);
    this.farmGroup.updateMatrixWorld(true);
    this.setupGnomeWalker(farmModel);

    // 保留透明陰影地板，不顯示背景格線
    this.shadowFloor.position.y = 0.001;

    const hotspotByRoot = new Map();

    farmModel.traverse((object) => {
      // 會飄動的葉子：記錄原始位置
      if (/Leaf_Float|Leaf_Drift/.test(object.name)) {
        this.floatingLeaves.push({
          object,
          basePosition: object.position.clone(),
          baseRotation: object.rotation.clone(),
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 0.6,
        });
      }

      if (!object.isMesh) return;
      // 透明的水不要投射陰影
      const isWater = /Water_Block/.test(object.name);
      object.castShadow = !isWater;
      object.receiveShadow = !isWater;
      (Array.isArray(object.material)
        ? object.material
        : [object.material]
      ).forEach(applyMaterialColor);

      if (this.hasIgnoredAncestor(object)) return;
      this.raycastTargets.push(object);

      // 找出符合規則、且最外層的父物件（例如整棵樹而不是只有樹葉）
      const match = this.findHotspotRoot(object);
      if (!match) return;

      let hotspot = hotspotByRoot.get(match.root);
      if (!hotspot) {
        hotspot = {
          root: match.root,
          rule: match.rule,
          meshes: [],
          topPoint: new THREE.Vector3(),
        };
        hotspotByRoot.set(match.root, hotspot);
      }
      // 每個 mesh 複製一份材質，避免 hover 發光時影響到共用材質的其他物件
      if (Array.isArray(object.material)) {
        object.material = object.material.map((material) => material.clone());
      } else {
        object.material = object.material.clone();
      }
      hotspot.meshes.push(object);
      object.userData.hotspot = hotspot;
    });

    // 計算每個互動物件的頂端中心點（提示詞會顯示在這裡）
    hotspotByRoot.forEach((hotspot) => {
      const hotspotBox = new THREE.Box3();
      hotspot.meshes.forEach((mesh) => hotspotBox.expandByObject(mesh));
      hotspotBox.getCenter(hotspot.topPoint);
      hotspot.topPoint.y = hotspotBox.max.y;
      if (/Gnome/.test(hotspot.root.name)) this.gnomeHotspot = hotspot;
    });
  }

  // 設定小矮人的草地散步路線。使用原本的整個人物群組移動，不修改 GLB 或其子物件。
  setupGnomeWalker(farmModel) {
    const figure = farmModel.getObjectByName("CHAR_GardenGnome");
    if (!figure) return;

    const origin = figure.position.clone();
    // 這幾個點都在小矮人原本所在的左前方草地；相對座標可避免模型置中後錯位。
    const offsets = [
      [0, 0],
      [-0.42, 0.02],
      [-0.82, 0.02],
      [-0.5, -0.08],
      [-0.12, -0.04],
    ];
    this.gnomeWalker = {
      object: figure,
      origin,
      baseRotation: figure.rotation.y,
      points: offsets.map(
        ([x, z]) => new THREE.Vector3(origin.x + x, origin.y, origin.z + z),
      ),
      index: 0,
      nextIndex: 1,
      progress: 0,
      pause: 1.5,
      walkSpeed: 0.25, // 每秒移動的模型單位
      heading: figure.rotation.y,
      stepPhase: 0,
    };
  }

  // 小矮人先轉向目的地、慢慢走過去，抵達後停一會兒再往下一個草地點。
  updateGnomeWalker(delta) {
    const walker = this.gnomeWalker;
    if (!walker) return;
    const step = Math.min(delta, 0.05);

    if (walker.pause > 0) {
      walker.pause = Math.max(0, walker.pause - step);
      walker.object.position.y = walker.origin.y;
      walker.object.rotation.x = 0;
      walker.object.rotation.z = 0;
    } else {
      const start = walker.points[walker.index];
      const end = walker.points[walker.nextIndex];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      // 模型朝向可能與 Blender 的前方不同；這裡僅控制水平轉向。
      const targetHeading = walker.baseRotation + Math.atan2(dx, dz);
      const angleDifference = Math.atan2(
        Math.sin(targetHeading - walker.heading),
        Math.cos(targetHeading - walker.heading),
      );
      walker.heading += angleDifference * Math.min(1, step * 4);
      walker.object.rotation.y = walker.heading;

      // 轉到接近路線方向才開始走，避免橫向滑動。
      if (Math.abs(angleDifference) < 0.22 && length > 0) {
        walker.progress = Math.min(
          1,
          walker.progress + (walker.walkSpeed * step) / length,
        );
        walker.object.position.lerpVectors(start, end, walker.progress);
        walker.stepPhase += step * 10;
        walker.object.position.y =
          walker.origin.y + Math.abs(Math.sin(walker.stepPhase)) * 0.018;
        walker.object.rotation.z = Math.sin(walker.stepPhase * 0.5) * 0.025;
      }
      if (walker.progress >= 1) {
        walker.index = walker.nextIndex;
        walker.nextIndex = (walker.nextIndex + 1) % walker.points.length;
        walker.progress = 0;
        walker.pause = 1.2 + Math.random() * 2.2;
        walker.object.position.y = walker.origin.y;
      }
    }

    // Hover 氣泡跟著小矮人一起移動，不停留在原本的草地位置。
    if (this.gnomeHotspot) {
      walker.object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3();
      this.gnomeHotspot.meshes.forEach((mesh) => bounds.expandByObject(mesh));
      bounds.getCenter(this.gnomeHotspot.topPoint);
      this.gnomeHotspot.topPoint.y = bounds.max.y;
    }
  }

  // 整理蘋果模型（結果畫面用）
  prepareApple(appleModel) {
    appleModel.traverse((object) => {
      if (object.isMesh) applyMaterialColor(object.material);
    });
    const box = new THREE.Box3().setFromObject(appleModel);
    const center = box.getCenter(new THREE.Vector3());
    appleModel.position.sub(center); // 讓蘋果以中心旋轉
    const wrapper = new THREE.Group();
    wrapper.add(appleModel);
    const size = box.getSize(new THREE.Vector3());
    wrapper.userData.baseScale = 1 / Math.max(size.x, size.y, size.z);
    this.appleTemplate = wrapper;
  }

  // 判斷物件或它的父物件是不是要忽略的
  hasIgnoredAncestor(object) {
    let current = object;
    while (current) {
      if (IGNORE_PATTERN.test(current.name)) return true;
      current = current.parent;
    }
    return false;
  }

  // 往上找符合 hover 規則的最外層父物件
  findHotspotRoot(object) {
    let current = object;
    let result = null;
    while (current && current !== this.farmGroup) {
      const rule = HOTSPOT_RULES.find((r) => r.pattern.test(current.name));
      if (rule && (!result || result.rule === rule)) {
        result = { root: current, rule };
      }
      current = current.parent;
    }
    return result;
  }

  // ---------- 畫面切換 ----------

  // 切換模式：home / intro / pick / fruit
  setMode(mode) {
    this.mode = mode;
    const preset = CAMERA_PRESETS[mode];

    this.controls.enableRotate = mode === "pick";
    // 低角度首頁與運鏡期間允許較接近水平的視角
    this.controls.maxPolarAngle = 1.55;
    this.controls.autoRotate = mode !== "home";
    this.controls.autoRotateSpeed = preset.rotateSpeed;
    if (mode !== "pick") this.setHoveredHotspot(null);

    // 鏡頭運鏡：從目前位置平滑移動到新設定
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    this.cameraTween = {
      startTime: this.clock.elapsedTime,
      duration: 1.6,
      from: {
        distance: spherical.radius,
        polarAngle: spherical.phi,
        azimuthAngle: spherical.theta,
        shiftX: this.currentShiftX,
        targetY: this.controls.target.y,
        fov: this.camera.fov,
      },
      to: preset,
    };

    if (mode === "fruit") {
      this.showFruitApples();
    } else {
      this.hideFruitApples();
    }
  }

  // 每一幀更新鏡頭運鏡
  updateCameraTween() {
    if (!this.cameraTween) return;
    const { startTime, duration, from, to } = this.cameraTween;
    const rawProgress = Math.min(
      (this.clock.elapsedTime - startTime) / duration,
      1,
    );
    const progress = easeInOutCubic(rawProgress);
    const lerp = (a, b) => a + (b - a) * progress;

    this.controls.target.y = lerp(from.targetY, to.targetY);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.radius = lerp(from.distance, to.distance);
    spherical.phi = lerp(from.polarAngle, to.polarAngle);
    // 返回首頁時走最短角度，回到固定構圖
    if (to.azimuthAngle !== undefined) {
      const angleDelta = Math.atan2(
        Math.sin(to.azimuthAngle - from.azimuthAngle),
        Math.cos(to.azimuthAngle - from.azimuthAngle),
      );
      spherical.theta = from.azimuthAngle + angleDelta * progress;
    }
    this.camera.position.setFromSpherical(spherical).add(this.controls.target);

    this.currentShiftX = lerp(from.shiftX, to.shiftX);
    // 首頁用較窄視角滿版顯示，其他畫面平滑恢復原本視角
    this.camera.fov = lerp(from.fov, to.fov ?? 35);
    this.applyViewShift();

    if (rawProgress >= 1) {
      this.cameraTween = null;
      this.controls.maxPolarAngle = this.mode === "home" ? 1.55 : 1.38;
      this.homeSwayStart = this.clock.elapsedTime;
    }
  }

  // 把畫面水平偏移（讓農場可以擺在畫面右邊）
  applyViewShift() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    // 手機直式畫面不偏移
    const shift = width < 760 ? 0 : this.currentShiftX;
    this.camera.setViewOffset(width, height, -shift * width, 0, width, height);
  }

  // ---------- hover 偵測 ----------

  // 找出滑鼠底下的互動物件
  findHotspotUnderPointer() {
    if (!this.raycaster) this.raycaster = new THREE.Raycaster();
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.raycastTargets, false);
    if (hits.length === 0) return null;
    return hits[0].object.userData.hotspot || null;
  }
  // 判斷滑鼠是否點到農場中的任何模型物件
  isPointerOverFarm() {
    if (!this.raycaster) {
      this.raycaster = new THREE.Raycaster();
    }

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hits = this.raycaster.intersectObjects(this.raycastTargets, false);

    return hits.length > 0;
  }
  // 設定目前 hover 的物件（處理發光效果）
  setHoveredHotspot(hotspot) {
    if (hotspot === this.hoveredHotspot) return;
    if (this.hoveredHotspot) this.setHotspotGlow(this.hoveredHotspot, false);
    this.hoveredHotspot = hotspot;
    if (hotspot) this.setHotspotGlow(hotspot, true);
    this.canvas.classList.toggle("is-hovering", !!hotspot);
    this.onHoverChange(hotspot ? hotspot.rule : null);
  }

  // 物件發光（hover 時）
  setHotspotGlow(hotspot, isOn) {
    hotspot.meshes.forEach((mesh) => {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((material) => {
        if (!material.emissive) return;
        if (isOn) {
          material.userData.originalEmissive = material.emissive.clone();
          material.userData.originalEmissiveIntensity =
            material.emissiveIntensity;
          // 原本就會發光的材質（燈火）不要改
          if (material.emissive.getHex() === 0x000000) {
            material.emissive.set(0xd8e86a);
            material.emissiveIntensity = 0.28;
          }
        } else if (material.userData.originalEmissive) {
          material.emissive.copy(material.userData.originalEmissive);
          material.emissiveIntensity =
            material.userData.originalEmissiveIntensity;
        }
      });
    });
  }

  // 取得目前 hover 物件在螢幕上的位置（給提示詞定位用）
  getHoveredScreenPosition() {
    if (!this.hoveredHotspot) return null;
    const point = this.hoveredHotspot.topPoint.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - point.y) / 2) * rect.height,
    };
  }

  // ---------- 結果畫面的蘋果 ----------

  showFruitApples() {
    if (!this.appleTemplate) return;
    this.hideFruitApples();
    this.fruitGroup.visible = true;

    // 三顆蘋果在鏡頭座標中的位置、大小
    const appleLayouts = [
      { position: new THREE.Vector3(-1.6, -1.5, -7.0), size: 2.1, delay: 0.25 },
      { position: new THREE.Vector3(1.1, -0.2, -6.5), size: 1.9, delay: 0.0 },
      { position: new THREE.Vector3(0.1, 2.4, -8.0), size: 1.8, delay: 0.45 },
    ];

    appleLayouts.forEach((layout) => {
      const apple = this.appleTemplate.clone(true);
      apple.scale.setScalar(0.0001);
      apple.rotation.set(0.25, Math.random() * Math.PI * 2, -0.15);
      this.fruitGroup.add(apple);
      this.fruitApples.push({
        object: apple,
        targetPosition: layout.position,
        targetScale: layout.size * this.appleTemplate.userData.baseScale,
        startTime: this.clock.elapsedTime + layout.delay,
        spinSpeed: 0.3 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    });
  }

  hideFruitApples() {
    this.fruitApples.forEach((apple) => this.fruitGroup.remove(apple.object));
    this.fruitApples = [];
    this.fruitGroup.visible = false;
  }

  // 蘋果掉下來 + 慢慢自轉
  updateFruitApples(elapsed, delta) {
    this.fruitApples.forEach((apple) => {
      const progress = Math.min(
        Math.max((elapsed - apple.startTime) / 1.1, 0),
        1,
      );
      const eased = easeOutBack(progress);
      const floatOffset = Math.sin(elapsed * 1.2 + apple.phase) * 0.08;
      apple.object.position.set(
        apple.targetPosition.x,
        apple.targetPosition.y + (1 - eased) * 6 + floatOffset,
        apple.targetPosition.z,
      );
      apple.object.scale.setScalar(Math.max(eased, 0.0001) * apple.targetScale);
      apple.object.rotation.y += apple.spinSpeed * delta;
    });
  }

  // ---------- 每一幀 ----------

  // 首頁固定在低角度近景，只做小幅度、緩慢的左右晃動
  updateHomeSway(elapsed) {
    if (this.mode !== "home" || this.cameraTween) return;
    const preset = CAMERA_PRESETS.home;
    const phase = ((elapsed - this.homeSwayStart) * Math.PI * 2) / 9;
    const angle = preset.azimuthAngle + Math.sin(phase) * 0.018;
    const direction = new THREE.Spherical(
      preset.distance,
      preset.polarAngle,
      angle,
    );
    this.camera.position.setFromSpherical(direction).add(this.controls.target);
  }

  // 飄動的葉子
  updateLeaves(elapsed) {
    this.floatingLeaves.forEach((leaf) => {
      const t = elapsed * leaf.speed + leaf.phase;
      leaf.object.position.y = leaf.basePosition.y + Math.sin(t) * 0.08;
      leaf.object.position.x = leaf.basePosition.x + Math.sin(t * 0.7) * 0.05;
      leaf.object.rotation.z = leaf.baseRotation.z + Math.sin(t * 0.9) * 0.4;
      leaf.object.rotation.x = leaf.baseRotation.x + Math.cos(t * 0.6) * 0.3;
      leaf.object.scale.setScalar(
        this.mode === "home" ? 0.4 : this.mode === "pick" ? 0.6 : 1,
      );
    });
  }

  renderFrame() {
    // 切水果時使用獨立砧板場景，不再繪製背景農場
    if (document.body.dataset.screen === "chop") {
      this.clock.getDelta();
      return;
    }
    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.updateCameraTween();

    // 抽選畫面才偵測 hover（拖曳中不偵測）
    if (this.mode === "pick" && !this.isDragging) {
      this.setHoveredHotspot(
        this.pointerInside ? this.findHotspotUnderPointer() : null,
      );
    }
    // 抽選畫面自動旋轉，Hover 到物件時暫停
    this.controls.autoRotate =
      this.mode !== "home" &&
      !this.cameraTween &&
      !(this.mode === "pick" && this.hoveredHotspot);
    this.updateHomeSway(elapsed);
    this.controls.update();
    this.updateLeaves(elapsed);
    this.updateGnomeWalker(delta);
    this.updateFruitApples(elapsed, delta);

    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.applyViewShift();
    this.camera.updateProjectionMatrix();
  }
}
