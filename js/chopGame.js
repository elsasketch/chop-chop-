import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createWatermelonFleshMaterial } from "./watermelonFlesh.js";

const FRUIT_SCALE = 0.0715;
const CUTS_PER_FRUIT = 2;
const BOARD_Y = 0.018;

// ========================================
// 各種蔬果的設定（名稱需與 main.js 的 FRUIT_POOL 相同）
// model：模型路徑
// size：相對蘋果的大小倍率（只影響遊戲中的大小，不改模型檔）
// createFlesh：切面果肉材質
// stemCapColor：果梗切面顏色
// ========================================
const FRUIT_TYPES = {
  蘋果: {
    model: "img/newapple2.glb",
    size: 1,
    createFlesh: () => createAppleFleshMaterial(),
    stemCapColor: 0x795035,
  },
  西瓜: {
    model: "img/watermelon_whole_baked.glb",
    size: 0.8,
    createFlesh: () => createWatermelonFleshMaterial(),
    stemCapColor: 0x6f8a3a,
  },
};

// 將原始三角形裁切到指定 X 平面的其中一側。
function clipTriangle(vertices, x, side) {
  const result = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % 3];
    const da = side * (a[0] - x),
      db = side * (b[0] - x);

    if (da >= 0) result.push(a);

    if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
      const t = da / (da - db);
      result.push(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return result;
}

// 將切線連成輪廓，生成果肉切面。
function makeContours(segments, x) {
  const points = new Map(),
    edges = new Map();

  const key = (v) => `${Math.round(v[1] * 1e5)},${Math.round(v[2] * 1e5)}`;

  for (const [a, b] of segments) {
    const ka = key(a),
      kb = key(b);

    if (ka === kb) continue;

    points.set(ka, a);
    points.set(kb, b);

    if (!edges.has(ka)) edges.set(ka, new Set());
    if (!edges.has(kb)) edges.set(kb, new Set());

    edges.get(ka).add(kb);
    edges.get(kb).add(ka);
  }

  const loops = [];

  while (edges.size) {
    const start = edges.keys().next().value;
    const ring = [start];

    let current = start,
      closed = false;

    for (let i = 0; i <= points.size; i++) {
      const next = edges.get(current)?.values().next().value;

      if (next === undefined) break;

      edges.get(current).delete(next);
      edges.get(next)?.delete(current);

      if (!edges.get(current).size) edges.delete(current);

      if (edges.get(next)?.size === 0) edges.delete(next);

      if (next === start) {
        closed = true;
        break;
      }

      ring.push(next);
      current = next;
    }

    if (closed && ring.length > 2) loops.push(ring.map((k) => points.get(k)));

    if (edges.has(current) && !edges.get(current).size) edges.delete(current);

    if (ring.length === 1) edges.delete(start);
  }

  // 接縫精度不一致時的備用輪廓。
  if (!loops.length && points.size > 2) {
    const ring = [...points.values()];

    const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;

    const cz = ring.reduce((a, p) => a + p[2], 0) / ring.length;

    ring.sort(
      (a, b) =>
        Math.atan2(a[2] - cz, a[1] - cy) - Math.atan2(b[2] - cz, b[1] - cy),
    );

    loops.push(ring);
  }

  return loops;
}

// ========================================
// 蘋果果肉材質（3D 立體紋理）
// ----------------------------------------
// 以頂點的 origin 屬性（切開前的原始蘋果座標）計算顏色：
// 果肉由內而外的漸層、中央果核、5 個種子腔與種子。
// 因為是在 3D 空間計算，切在哪裡就呈現那個位置真實的剖面。
// 座標單位與 newapple2.glb 相同：y 朝上，果核中心約在 y = 0.92。
// ========================================
function createAppleFleshMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0,
  });

  // 顏色（會自動轉成線性色彩空間）
  const colors = {
    uFleshInner: new THREE.Color("#fff4d0"), // 果肉中心：淡奶油黃
    uFleshOuter: new THREE.Color("#f8e6b0"), // 靠近果皮：稍深的米黃
    uFleshBlush: new THREE.Color("#ffbe55"), // 果皮內側淡淡的暖色
    uCore: new THREE.Color("#ffda73"), // 果核
    uCoreLine: new THREE.Color("#ffd87c"), // 果核輪廓線
    uCavity: new THREE.Color("#f0dca8"), // 種子腔
    uCavityLine: new THREE.Color("#fde1a8"), // 種子腔輪廓
    uSeed: new THREE.Color("#4a2615"), // 種子
    uSeedLight: new THREE.Color("#8d5d39"), // 種子反光
  };

  material.onBeforeCompile = (shader) => {
    for (const [name, color] of Object.entries(colors)) {
      shader.uniforms[name] = { value: color };
    }

    // 頂點著色器：把原始座標傳給片段著色器
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 origin;
        varying vec3 vAppleOrigin;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vAppleOrigin = origin;`,
      );

    // 片段著色器：依 3D 位置決定果肉、果核與種子的顏色
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vAppleOrigin;
        uniform vec3 uFleshInner, uFleshOuter, uFleshBlush, uCore, uCoreLine;
        uniform vec3 uCavity, uCavityLine, uSeed, uSeedLight;

        // 細小的果肉顆粒感
        float appleGrain(vec3 p) {
          return fract(sin(dot(floor(p * 140.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 o = vAppleOrigin - vec3(0.0, 0.92, 0.0); // 以果核中心為原點

        // 果肉：由中心往外漸層，靠近果皮帶一點暖色
        float distanceFromCore = length(vec3(o.x, o.y * 0.85, o.z));
        vec3 flesh = mix(uFleshInner, uFleshOuter, smoothstep(0.25, 0.95, distanceFromCore));
        flesh = mix(flesh, uFleshBlush, smoothstep(0.82, 1.0, distanceFromCore) * 0.5);
        flesh *= 0.985 + 0.03 * appleGrain(vAppleOrigin);

        // 果核：沿中軸的橢圓體
        float coreShape = length(vec3(o.x / 0.34, o.y / 0.55, o.z / 0.34));
        flesh = mix(flesh, uCore, 1.0 - smoothstep(0.93, 1.0, coreShape));
        flesh = mix(flesh, uCoreLine, (1.0 - smoothstep(0.0, 0.05, abs(coreShape - 1.0))) * 0.7);

        // 判斷切面方向：用原始座標的變化量求出切面法線。
        // 法線接近上下方向 = 橫切，橫切面不顯示種子與種子腔。
        vec3 cutNormal = normalize(cross(dFdx(vAppleOrigin), dFdy(vAppleOrigin)));
        float verticalCut = 1.0 - smoothstep(0.55, 0.8, abs(cutNormal.y));

        // 5 個種子腔排成星形，每個腔內有兩顆並排的種子（尖端朝上），只在直切面出現。
        // 星形角度錯開，讓從中間直切時，左右兩側都會切到種子腔。
        for (int k = 0; k < 5; k++) {
          float angle = float(k) * 1.2566371 + 1.2566371;
          vec2 radialDir = vec2(cos(angle), sin(angle));
          float radial = dot(o.xz, radialDir) - 0.17;
          float tangent = dot(o.xz, vec2(-radialDir.y, radialDir.x));
          float height = o.y + 0.01;

          float cavity = length(vec3(radial / 0.075, tangent / 0.07, height / 0.18));
          flesh = mix(flesh, uCavity, (1.0 - smoothstep(0.85, 1.0, cavity)) * verticalCut);
          flesh = mix(flesh, uCavityLine, (1.0 - smoothstep(0.0, 0.07, abs(cavity - 1.0))) * 0.6 * verticalCut);

          float taper = 1.0 - 0.5 * clamp(height / 0.13, 0.0, 1.0);
          for (int s = 0; s < 2; s++) {
            float side = s == 0 ? -1.0 : 1.0;
            float seedTangent = tangent - side * 0.033; // 兩顆種子左右並排、高度對齊
            float seed = length(vec3(radial / 0.036, seedTangent / (0.04 * taper), height / 0.12));
            float seedMask = (1.0 - smoothstep(0.8, 1.0, seed)) * verticalCut;
            vec3 seedColor = mix(uSeed, uSeedLight, (1.0 - smoothstep(0.0, 0.6, seed)) * 0.35);
            flesh = mix(flesh, seedColor, seedMask);
          }
        }

        diffuseColor.rgb = flesh;`,
      );
  };

  // 讓 three.js 知道這是獨立的著色器版本
  material.customProgramCacheKey = () => "apple-flesh-3d";

  return material;
}

// 真正分割網格，保留果皮、果肉與材質。
export function sliceMesh(mesh, x, fleshMaterial) {
  const geometry = mesh.geometry;

  const pos = geometry.attributes.position,
    normal = geometry.attributes.normal,
    uv = geometry.attributes.uv,
    color = geometry.attributes.color,
    // 原始蘋果座標：切片會被平移、旋轉，果肉材質需用切開前的座標判斷果核與種子位置
    origin = geometry.attributes.origin ?? geometry.attributes.position;

  const index = geometry.index;
  const count = index ? index.count : pos.count;

  const materials = Array.isArray(mesh.material)
    ? [...mesh.material]
    : [mesh.material];

  let capIndex = materials.indexOf(fleshMaterial);

  if (capIndex < 0) {
    capIndex = materials.length;
    materials.push(fleshMaterial);
  }

  const output = [new Map(), new Map()];
  const segments = [];

  const get = (i) => [
    pos.getX(i),
    pos.getY(i),
    pos.getZ(i),
    normal?.getX(i) ?? 0,
    normal?.getY(i) ?? 1,
    normal?.getZ(i) ?? 0,
    uv?.getX(i) ?? 0,
    uv?.getY(i) ?? 0,
    color?.getX(i) ?? 1,
    color?.getY(i) ?? 1,
    color?.getZ(i) ?? 1,
    origin.getX(i),
    origin.getY(i),
    origin.getZ(i),
  ];

  const add = (out, mat, tri) => {
    if (!out.has(mat)) out.set(mat, []);
    out.get(mat).push(...tri);
  };

  let groupIndex = 0;

  for (let i = 0; i < count; i += 3) {
    while (
      groupIndex + 1 < geometry.groups.length &&
      i >= geometry.groups[groupIndex].start + geometry.groups[groupIndex].count
    ) {
      groupIndex++;
    }

    const mat = geometry.groups[groupIndex]?.materialIndex ?? 0;

    const vertices = [0, 1, 2].map((k) =>
      get(index ? index.getX(i + k) : i + k),
    );

    const intersections = [];

    for (let k = 0; k < 3; k++) {
      const a = vertices[k],
        b = vertices[(k + 1) % 3];

      if ((a[0] < x && b[0] >= x) || (a[0] >= x && b[0] < x)) {
        const t = (x - a[0]) / (b[0] - a[0]);

        intersections.push(a.map((v, j) => v + (b[j] - v) * t));
      }
    }

    if (intersections.length === 2) segments.push(intersections);

    for (let side = 0; side < 2; side++) {
      const polygon = clipTriangle(vertices, x, side ? 1 : -1);

      for (let k = 1; k + 1 < polygon.length; k++) {
        add(output[side], mat, [polygon[0], polygon[k], polygon[k + 1]]);
      }
    }
  }

  for (const loop of makeContours(segments, x)) {
    const contour = loop.map((v) => new THREE.Vector2(v[1], v[2]));

    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);

    for (const [a, b, c] of triangles) {
      const v = [loop[a], loop[b], loop[c]];

      const sign =
        (v[1][1] - v[0][1]) * (v[2][2] - v[0][2]) -
        (v[1][2] - v[0][2]) * (v[2][1] - v[0][1]);

      for (let side = 0; side < 2; side++) {
        const nx = side ? -1 : 1;

        const order = sign * nx >= 0 ? v : [v[0], v[2], v[1]];

        add(
          output[side],
          capIndex,
          order.map((p) => [
            x,
            p[1],
            p[2],
            nx,
            0,
            0,
            (p[2] + 1.1) / 2.2,
            p[1] / 2.2,
            1,
            1,
            1,
            p[11],
            p[12],
            p[13],
          ]),
        );
      }
    }
  }

  return output.map((out) => {
    if (!out.size) return null;

    const g = new THREE.BufferGeometry();

    const p = [],
      n = [],
      u = [],
      c = [],
      o = [];

    for (const [materialIndex, vertices] of out) {
      g.addGroup(p.length / 3, vertices.length, materialIndex);

      for (const v of vertices) {
        p.push(...v.slice(0, 3));
        n.push(...v.slice(3, 6));
        u.push(...v.slice(6, 8));
        c.push(...v.slice(8, 11));
        o.push(...v.slice(11, 14));
      }
    }

    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));

    g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));

    g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));

    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));

    // 保留原始蘋果座標，下一刀的切面也能正確判斷果核與種子位置
    g.setAttribute("origin", new THREE.Float32BufferAttribute(o, 3));

    g.normalizeNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();

    const result = new THREE.Mesh(g, materials);

    result.castShadow = true;
    result.receiveShadow = true;

    return result;
  });
}

export class ChopGame {
  constructor(canvas, onExit, onResult) {
    this.canvas = canvas;
    this.onExit = onExit;
    this.onResult = onResult;

    this.pointer = document.getElementById("qtePointer");

    this.zones = [
      document.getElementById("qteZoneA"),
      document.getElementById("qteZoneB"),
    ];

    this.feedback = document.getElementById("chopFeedback");
    this.progress = document.getElementById("chopProgress");
    this.scoreLabel = document.getElementById("chopScore");
    this.strikeButton = document.getElementById("btnStrike");

    this.active = false;
    this.session = 0;

    this.strikeButton.addEventListener("click", () => this.strike());

    canvas.addEventListener("pointerdown", () => this.strike());

    window.addEventListener("keydown", (e) => {
      if (
        !this.active ||
        this.state !== "aim" ||
        e.code !== "Space" ||
        e.repeat
      )
        return;

      e.preventDefault();
      this.strike();
    });

    window.addEventListener("resize", () => this.resize());
  }

  async load() {
    if (this.loading) return this.loading;

    this.loading = (async () => {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
      });

      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

      this.renderer.toneMappingExposure = 0.85;

      this.scene = new THREE.Scene();

      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);

      const pmrem = new THREE.PMREMGenerator(this.renderer);

      this.scene.environment = pmrem.fromScene(
        new RoomEnvironment(),
        0.04,
      ).texture;

      pmrem.dispose();

      this.camera = new THREE.PerspectiveCamera(38, 1, 0.005, 20);

      this.camera.position.set(0.025, 0.43, 0.5);
      this.camera.lookAt(0, 0.045, 0);

      this.scene.add(new THREE.HemisphereLight(0xfff8ee, 0xa3997d, 1.2));

      const light = new THREE.DirectionalLight(0xfff1d7, 1.8);

      light.position.set(-0.4, 0.8, 0.5);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);

      Object.assign(light.shadow.camera, {
        left: -0.6,
        right: 0.6,
        top: 0.6,
        bottom: -0.6,
        near: 0.01,
        far: 3,
      });

      light.shadow.bias = -0.0003;

      this.scene.add(light);

      const loader = new GLTFLoader();

      // 同時載入所有蔬果模型與盤子
      const fruitNames = Object.keys(FRUIT_TYPES);

      const [plate, ...fruitModels] = await Promise.all([
        loader.loadAsync("img/plate.glb").catch((error) => {
          console.warn("盤子模型載入失敗，使用備用盤子", error);
          return null;
        }),
        ...fruitNames.map((name) =>
          loader.loadAsync(FRUIT_TYPES[name].model).catch((error) => {
            console.warn(`${name}模型載入失敗`, error);
            return null;
          }),
        ),
      ]);

      // 砧板改用 CSS 背景圖，3D 場景只保留水果、刀與透明接影平面。
      // 物理碰撞仍使用 BOARD_Y，不依賴圖片或舊 GLB。
      this.boardScene = new THREE.Group();
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.ShadowMaterial({ opacity: 0.24, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = BOARD_Y - 0.0005;
      shadow.receiveShadow = true;
      this.boardScene.add(shadow);
      this.scene.add(this.boardScene);

      // 結算盤：地面保持靜止，盤子與水果一起旋轉。
      this.resultRoot = new THREE.Group();
      this.resultRoot.visible = false;
      this.scene.add(this.resultRoot);
      this.plateTurntable = new THREE.Group();
      this.resultRoot.add(this.plateTurntable);
      // GLB 的場景與盤子同名，只搜尋真正的 Mesh。
      const plateMeshes = new Map();
      if (plate) {
        plate.scene.updateMatrixWorld(true);
        plate.scene.traverse((o) => {
          if (o.isMesh && o.geometry) plateMeshes.set(o.name, o);
        });
      }
      for (const name of ["Studio_Ground", "Plate"]) {
        const source = plateMeshes.get(name);
        let mesh;
        if (source) {
          mesh = source.clone();
          mesh.geometry = source.geometry.clone();
          mesh.geometry.applyMatrix4(source.matrixWorld);
          mesh.position.set(0, 0, 0);
          mesh.quaternion.identity();
          mesh.scale.setScalar(0.1);
        } else if (name === "Plate") {
          const profile = [
            [0, 0],
            [0.26, 0],
            [0.3, 0.035],
            [0.3, 0.044],
            [0.292, 0.045],
            [0.275, 0.042],
            [0.27, 0.036],
            [0.245, 0.034],
            [0.24, 0.027],
            [0.215, 0.022],
            [0.21, 0.016],
            [0.19, 0.013],
            [0.16, 0.01],
            [0, 0.01],
          ];
          mesh = new THREE.Mesh(
            new THREE.LatheGeometry(
              profile.map(([r, y]) => new THREE.Vector2(r, y)),
              96,
            ),
            new THREE.MeshStandardMaterial({
              color: 0xf5f3ed,
              roughness: 0.22,
              side: THREE.DoubleSide,
            }),
          );
        } else {
          mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 3),
            new THREE.MeshStandardMaterial({ color: 0xe3ddc9 }),
          );
          mesh.rotation.x = -Math.PI / 2;
        }
        mesh.castShadow = name === "Plate";
        mesh.receiveShadow = true;
        (name === "Plate" ? this.plateTurntable : this.resultRoot).add(mesh);
      }
      this.resultFruitRoot = new THREE.Group();
      this.plateTurntable.add(this.resultFruitRoot);

      this.seedMaterial = new THREE.MeshStandardMaterial({
        color: 0x684125,
        roughness: 0.62,
      });

      // 整理每一種蔬果的網格與切面材質
      this.fruitData = {};

      fruitNames.forEach((name, index) => {
        const model = fruitModels[index];
        if (!model) return;

        const type = FRUIT_TYPES[name];
        const meshes = [];

        model.scene.updateMatrixWorld(true);

        model.scene.traverse((o) => {
          if (!o.isMesh) return;

          // 西瓜 GLB 內的果肉材質展示片只是放貼圖用，遊戲中不顯示
          if (/FleshCap/i.test(o.name) || /Flesh/i.test(o.material?.name ?? "")) return;

          const g = o.geometry.clone();

          g.applyMatrix4(o.matrixWorld);

          // 記錄原始座標，供果肉材質判斷果核、種子位置（必須在縮放前記錄）
          g.setAttribute("origin", g.attributes.position.clone());

          meshes.push({ geometry: g, material: o.material, stem: /Stem/i.test(o.name) });
        });

        // 依設定的大小倍率縮放，並讓水平方向置中、底部貼齊 y = 0
        const box = new THREE.Box3();
        for (const m of meshes) {
          m.geometry.computeBoundingBox();
          box.union(m.geometry.boundingBox);
        }
        const center = box.getCenter(new THREE.Vector3());
        const placement = new THREE.Matrix4()
          .makeScale(type.size, type.size, type.size)
          .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));

        // 蘋果維持原本的位置，只有其他蔬果才重新擺放
        for (const m of meshes) {
          if (name !== "蘋果") m.geometry.applyMatrix4(placement);
          m.geometry.computeBoundingBox();
        }

        this.fruitData[name] = {
          meshes,
          flesh: type.createFlesh(),
          stemCap: new THREE.MeshStandardMaterial({ color: type.stemCapColor, roughness: 0.8 }),
        };
      });

      // 保留原本的變數名稱，其他程式不需修改
      this.appleMeshes = this.fruitData["蘋果"]?.meshes ?? [];
      this.flesh = this.fruitData["蘋果"]?.flesh;
      this.stemCap = this.fruitData["蘋果"]?.stemCap;

      this.appleRoot = new THREE.Group();

      this.appleRoot.scale.setScalar(FRUIT_SCALE);

      this.scene.add(this.appleRoot);

      // 建立刀具。
      this.knife = new THREE.Group();

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.003, 0.067, 0.13),
        new THREE.MeshStandardMaterial({
          color: 0xdadfe0,
          metalness: 0.75,
          roughness: 0.26,
        }),
      );

      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.019, 0.065),
        new THREE.MeshStandardMaterial({
          color: 0x68422a,
          roughness: 0.8,
        }),
      );

      blade.position.y = 0.033;

      handle.position.set(0, 0.056, 0.095);

      this.knife.add(blade, handle);
      this.knife.visible = false;

      this.scene.add(this.knife);

      this.resize();
    })();

    return this.loading;
  }

  resize() {
    if (!this.renderer) return;

    const w = this.canvas.clientWidth || innerWidth,
      h = this.canvas.clientHeight || innerHeight;

    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;
    if (this.state === "result") {
      // 直式畫面保留整個盤子，橫式則留給分數面板。
      const aspect = w / h;
      this.camera.fov =
        aspect < 1
          ? Math.max(
              48,
              THREE.MathUtils.radToDeg(2 * Math.atan(0.39 / (0.96 * aspect))),
            )
          : 42;
      this.camera.position.set(aspect < 1 ? 0 : 0.12, 0.78, 0.57);
      this.camera.lookAt(aspect < 1 ? 0 : 0.12, 0.08, 0);
    } else {
      // 背景為 16:9 cover；寬螢幕裁切上下時，同步調整 3D 視野。
      const coverScale = Math.max(1, w / h / (16 / 9));
      this.camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(46 / 2)) / coverScale),
      );
      // 配合背景圖較高的俯視角度，砧板中心對準水果落點。
      this.camera.position.set(0, 0.58, 0.33);
      this.camera.lookAt(0, BOARD_Y, 0);
    }

    this.camera.updateProjectionMatrix();
  }

  async start(fruits) {
    const id = ++this.session;

    this.active = true;
    this.state = "loading";
    this.queue = fruits;
    this.fruitIndex = 0;
    this.score = 0;
    this.points = 0;
    this.gradeCounts = { perfect: 0, good: 0, miss: 0 };
    this.clearResult();

    this.strikeButton.disabled = true;
    this.feedback.textContent = "砧板準備中…";
    this.strikeButton.textContent = "Chop!";

    try {
      await this.load();

      if (!this.active || id !== this.session) return;

      this.lastFrameTime = undefined;
      this.scene.background = null;
      this.boardScene.visible = true;
      this.appleRoot.visible = true;
      this.resultRoot.visible = false;

      this.spawnFruit(performance.now());
      this.resize();

      this.renderer.setAnimationLoop((t) => this.frame(t));
    } catch (e) {
      console.error(e);

      this.feedback.textContent = `砧板載入失敗：${e?.message || e}`;
      this.loading = null;
    }
  }

  stop() {
    this.active = false;
    this.session++;

    this.renderer?.setAnimationLoop(null);
    this.clearResult();

    this.strikeButton.disabled = true;
  }

  clearFruit() {
    while (this.appleRoot.children.length) {
      const child = this.appleRoot.children[0];

      this.appleRoot.remove(child);

      child.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
    }
  }

  spawnFruit(now) {
    this.clearFruit();

    this.cuts = 0;
    this.pieces = [];
    this.fallingPieces = [];

    const piece = new THREE.Group();

    // 依目前這一顆的名稱取得對應模型，找不到時用蘋果
    const fruitName = this.queue[this.fruitIndex]?.name;
    this.currentFruit = this.fruitData[fruitName] ?? this.fruitData["蘋果"];

    for (const m of this.currentFruit.meshes) {
      const mesh = new THREE.Mesh(m.geometry.clone(), m.material);

      mesh.userData.stem = m.stem;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      piece.add(mesh);
    }

    this.appleRoot.add(piece);
    this.pieces.push(piece);

    this.appleRoot.position.set(0, BOARD_Y + 0.32, 0);

    this.knife.visible = false;

    this.state = "drop";
    this.stateAt = now;

    this.strikeButton.disabled = true;

    this.progress.textContent = `水果 ${this.fruitIndex + 1} / ${this.queue.length} · ${this.queue[this.fruitIndex].name}`;

    this.scoreLabel.textContent = `成功 ${this.score} / ${this.queue.length * CUTS_PER_FRUIT}`;

    this.feedback.textContent = "水果準備落下…";
  }

  setZones(now, randomize = true) {
    if (randomize || !this.ranges) {
      const zoneWidth = 0.15;
      const minGap = 0.06;
      const edgeMargin = 0.02;

      const maxA = 1 - 2 * zoneWidth - minGap - 2 * edgeMargin;

      const zoneA = edgeMargin + Math.random() * maxA;

      const minB = zoneA + zoneWidth + minGap;
      const maxB = 1 - zoneWidth - edgeMargin;

      const zoneB = minB + Math.random() * (maxB - minB);

      // 第三個值是對應的感應區元素編號（0 = qteZoneA，1 = qteZoneB）
      this.ranges = [
        [zoneA, zoneA + zoneWidth, 0],
        [zoneB, zoneB + zoneWidth, 1],
      ];
    }

    // 先隱藏全部感應區，再只顯示還留著的區間
    this.zones.forEach((zone) => {
      zone.style.display = "none";
    });

    this.ranges.forEach(([start, end, zoneIndex]) => {
      const zone = this.zones[zoneIndex];

      zone.style.display = "";

      zone.style.left = `${start * 100}%`;

      zone.style.width = `${(end - start) * 100}%`;
    });

    this.state = "aim";
    this.stateAt = now;
    this.position = 0;

    this.strikeButton.disabled = false;

    this.feedback.textContent = "看準時機，按下 Chop！";
  }

  // 計算水果切片原始範圍。
  pieceBounds(piece) {
    const b = new THREE.Box3();

    for (const mesh of piece.children) {
      if (!mesh.userData.stem) {
        mesh.geometry.computeBoundingBox();
        b.union(mesh.geometry.boundingBox);
      }
    }

    return b;
  }

  // ========================================
  // 新增：計算切片旋轉後的實際碰撞範圍
  // ========================================

  collisionBounds(piece) {
    piece.updateMatrix();

    const box = new THREE.Box3();
    const point = new THREE.Vector3();

    for (const mesh of piece.children) {
      if (!mesh.isMesh) continue;

      const positions = mesh.geometry.attributes.position;

      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(piece.matrix);

        box.expandByPoint(point);
      }
    }

    return box;
  }

  // ========================================
  // 新增：讓每個切片擁有獨立旋轉中心
  // ========================================

  centerPiece(piece) {
    const box = this.pieceBounds(piece);

    const center = box.getCenter(new THREE.Vector3());

    for (const mesh of piece.children) {
      mesh.geometry.translate(-center.x, -center.y, -center.z);

      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }

    piece.position.add(center.clone().applyQuaternion(piece.quaternion));

    return box.getSize(new THREE.Vector3());
  }

  // ========================================
  // 重力、自然傾倒、砧板碰撞、切片防重疊
  // ========================================

  updateFallingPieces(delta) {
    if (!this.fallingPieces?.length) return;

    const elapsed = Math.min(delta / 1000, 0.05);

    // 使用小時間步長，避免切片高速穿透。
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));

    const dt = elapsed / steps;

    const floor = (BOARD_Y - this.appleRoot.position.y) / FRUIT_SCALE + 0.002;

    const bodies = this.fallingPieces;

    for (let step = 0; step < steps; step++) {
      for (const body of bodies) {
        const { piece, velocity, spin } = body;

        if (!body.held) {
          // 重力方向：Y 軸負方向。
          velocity.y -= 18 * dt;

          piece.position.addScaledVector(velocity, dt);

          // 切片逐漸向外傾倒。
          const error = body.targetTilt - body.tilt;

          spin.z += (22 * error - 8 * spin.z) * dt;

          const turn = spin.z * dt;

          body.tilt += turn;

          piece.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), turn);
        }

        // 計算旋轉後切片實際外框。
        body.box = this.collisionBounds(piece);

        // 與砧板碰撞，避免穿過砧板。
        if (body.box.min.y < floor) {
          const lift = floor - body.box.min.y;

          piece.position.y += lift;

          body.box.min.y += lift;
          body.box.max.y += lift;

          // 接觸砧板後產生自然反彈。
          if (velocity.y < -0.35) {
            velocity.y *= -0.32;
          } else {
            velocity.y = 0;
          }

          // 摩擦力，讓水果逐漸停止滑動。
          velocity.x *= Math.exp(-9 * dt);
          velocity.z *= Math.exp(-9 * dt);
        }
      }

      // ========================================
      // 切片之間的碰撞分離
      // 多次迭代處理所有相鄰切片。
      // ========================================

      for (let pass = 0; pass < 12; pass++) {
        for (let i = 0; i + 1 < bodies.length; i++) {
          const a = bodies[i];
          const b = bodies[i + 1];

          const overlap = a.box.max.x - b.box.min.x + 0.012;

          if (overlap <= 0) continue;

          // 根據切片大小分配碰撞位移。
          const share = a.held
            ? 0
            : b.held
              ? 1
              : b.massRatio / (a.massRatio + b.massRatio);

          const left = overlap * share;
          const right = overlap - left;

          // 將重疊的水果切片向外分離。
          a.piece.position.x -= left;
          b.piece.position.x += right;

          a.box.min.x -= left;
          a.box.max.x -= left;

          b.box.min.x += right;
          b.box.max.x += right;

          // 避免切片持續互相擠壓。
          if (a.velocity.x > b.velocity.x) {
            const speed =
              (a.velocity.x * a.massRatio + b.velocity.x * b.massRatio) /
              (a.massRatio + b.massRatio);

            a.velocity.x = a.held ? 0 : speed;
            b.velocity.x = b.held ? 0 : speed;
          }
        }
      }
    }
  }

  strike() {
    if (!this.active) return;

    if (this.state === "done") {
      this.onExit();
      return;
    }

    if (this.state !== "aim") return;

    const now = performance.now();

    this.position = this.getPosition(now);

    this.pointer.style.left = `${this.position * 100}%`;

    const hit = this.ranges.some(
      ([a, b]) => this.position >= a && this.position <= b,
    );

    // 計算指針距離綠色區域的距離。
    const distanceToGreen = Math.min(
      ...this.ranges.map(([start, end]) => {
        if (this.position < start) return start - this.position;

        if (this.position > end) return this.position - end;

        return 0;
      }),
    );

    let resultText;

    if (distanceToGreen === 0) {
      resultText = "Perfect！完美切割！";
    } else if (distanceToGreen <= 0.12) {
      resultText = "Good！成功切割！";
    } else {
      resultText = "再加把勁！";
    }

    this.feedback.classList.remove("is-miss");

    // 選擇最大的切片進行下一刀。
    const piece = this.pieces.reduce((a, b) =>
      this.pieceBounds(a).getSize(new THREE.Vector3()).x >=
      this.pieceBounds(b).getSize(new THREE.Vector3()).x
        ? a
        : b,
    );

    // 切割時暫時固定被切的水果。
    const held = this.fallingPieces.find((body) => body.piece === piece);

    if (held) {
      held.held = true;
      held.velocity.set(0, 0, 0);
      held.spin.set(0, 0, 0);
    }

    // 將目前旋轉姿態烘焙進網格，
    // 讓第二刀仍然沿垂直方向切下。
    const rotation = new THREE.Matrix4().makeRotationFromQuaternion(
      piece.quaternion,
    );

    for (const mesh of piece.children) {
      mesh.geometry.applyMatrix4(rotation);
      mesh.geometry.computeBoundingBox();
    }

    piece.quaternion.identity();

    const bounds = this.pieceBounds(piece);

    // QTE 位置決定切割位置。
    const x = THREE.MathUtils.lerp(
      bounds.min.x,
      bounds.max.x,
      0.1 + this.position * 0.8,
    );

    this.pending = { piece, x };

    this.knife.position.set(
      this.appleRoot.position.x + (x + piece.position.x) * FRUIT_SCALE,

      BOARD_Y + 0.2,

      this.appleRoot.position.z + piece.position.z * FRUIT_SCALE,
    );

    this.knife.visible = true;

    this.state = "strike";
    this.stateAt = now;

    this.strikeButton.disabled = true;
    // 三種判定暫時共用 Perfect 圖，日後只需替換對應路徑。
    const feedbackImages = {
      perfect: "img/perfect.png",
      good: "img/good.png",
      miss: "img/miss.png",
    };
    const result =
      distanceToGreen === 0
        ? "perfect"
        : distanceToGreen <= 0.12
          ? "good"
          : "miss";
    const image = document.createElement("img");
    image.src = feedbackImages[result];
    image.alt = resultText;
    image.className = "chop-feedback-image";
    this.feedback.replaceChildren(image);
    this.pending.grade = result;

    // 記錄這一刀切中（或最接近）的感應區，切完後要移除它
    const distances = this.ranges.map(([start, end]) =>
      Math.max(start - this.position, this.position - end, 0),
    );
    this.pending.rangeIndex = distances.indexOf(Math.min(...distances));
  }

  splitPending(now) {
    const { piece, x } = this.pending;

    const halves = [new THREE.Group(), new THREE.Group()];

    for (const mesh of piece.children) {
      const parts = sliceMesh(
        mesh,
        x,
        mesh.userData.stem ? this.currentFruit.stemCap : this.currentFruit.flesh,
      );

      parts.forEach((part, i) => {
        if (part) {
          part.userData.stem = mesh.userData.stem;
          halves[i].add(part);
        }
      });
    }

    // 避免產生沒有果肉的空切片。
    if (halves.some((h) => !h.children.some((m) => !m.userData.stem))) {
      const held = this.fallingPieces.find((body) => body.piece === piece);

      if (held) held.held = false;

      this.knife.visible = false;

      this.setZones(now);

      return;
    }

    // 種子改由果肉材質在切面上計算，不再額外加入球形種子（舊做法會穿出切片）。

    const at = this.pieces.indexOf(piece);

    // 保留原切片目前的位置與旋轉。
    const parentPosition = piece.position.clone();

    const parentQuaternion = piece.quaternion.clone();

    const originalSize = this.pieceBounds(piece).getSize(new THREE.Vector3());

    const widths = halves.map(
      (h) => this.pieceBounds(h).getSize(new THREE.Vector3()).x,
    );

    // 移除被切開的原水果。
    this.appleRoot.remove(piece);

    piece.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });

    const oldBodyIndex = this.fallingPieces.findIndex(
      (body) => body.piece === piece,
    );

    const oldMass =
      oldBodyIndex < 0 ? 1 : this.fallingPieces[oldBodyIndex].massRatio;

    const newBodies = [];

    halves.forEach((h, i) => {
      h.position.copy(parentPosition);
      h.quaternion.copy(parentQuaternion);

      // 建立各自的旋轉中心。
      this.centerPiece(h);

      this.appleRoot.add(h);

      const ratio = THREE.MathUtils.clamp(
        widths[i] / Math.max(originalSize.x, 0.001),
        0.08,
        0.92,
      );

      const side = i === 0 ? -1 : 1;

      // ========================================
      // 切開後自然倒下，不再向上彈飛。
      // ========================================

      newBodies.push({
        piece: h,

        // 只有少量水平速度，沒有向上速度。
        velocity: new THREE.Vector3(side * 0.65, 2.8, 0),

        spin: new THREE.Vector3(),

        massRatio: oldMass * ratio,

        tilt: 0,

        // 左邊向左倒、右邊向右倒。
        targetTilt: -side * Math.PI * (0.38 + (1 - ratio) * 0.1),

        held: false,
      });
    });

    // 用新的兩個切片替換舊切片，
    // 保留其他已切開的水果碰撞資料。
    this.fallingPieces.splice(
      Math.max(0, oldBodyIndex),
      oldBodyIndex < 0 ? 0 : 1,
      ...newBodies,
    );

    // 切開當下立即執行碰撞判定，
    // 避免第一幀就出現重疊。
    this.updateFallingPieces(0);

    this.pieces.splice(at, 1, ...halves);

    this.cuts++;
    this.score++;

    // 切完一刀後，移除剛剛切中的感應區，只留下另一個
    if (this.ranges.length > 1) {
      this.ranges.splice(this.pending.rangeIndex, 1);
    }

    const grade = this.pending.grade;
    this.gradeCounts[grade]++;
    this.points += { perfect: 100, good: 60, miss: 0 }[grade];

    this.scoreLabel.textContent = `成功 ${this.score} / ${this.queue.length * CUTS_PER_FRUIT}`;

    this.state = "separate";
    this.stateAt = now;
  }

  // 保存每關真正切出的網格，避免下一顆水果生成時被 dispose。
  saveRoundPieces() {
    for (const piece of this.pieces) {
      const copy = piece.clone(true);
      copy.traverse((o) => {
        if (o.isMesh) o.geometry = o.geometry.clone();
      });
      copy.position.set(0, 0, 0);
      this.savedPieces.push(copy);
    }
  }

  clearResult() {
    const disposed = new Set();
    const dispose = (piece) => {
      piece.traverse((o) => {
        if (o.isMesh && !disposed.has(o.geometry)) {
          disposed.add(o.geometry);
          o.geometry.dispose();
        }
      });
    };
    for (const piece of this.savedPieces ?? []) dispose(piece);
    if (this.resultFruitRoot) {
      for (const piece of this.resultFruitRoot.children) dispose(piece);
      this.resultFruitRoot.clear();
    }
    this.savedPieces = [];
    this.resultBodies = [];
    this.resultRevealed = false;
    document.getElementById("resultScorePanel").classList.remove("is-revealed");
    document.getElementById("resultStatus").classList.remove("is-finished");
  }

  // plate.glb 的盤內表面高度，依半徑線性插值（模型縮放為 0.1）。
  plateHeight(radius) {
    const profile = [
      [0, 0.01],
      [0.16, 0.01],
      [0.19, 0.013],
      [0.21, 0.016],
      [0.215, 0.022],
      [0.24, 0.027],
      [0.245, 0.034],
      [0.27, 0.036],
      [0.275, 0.042],
      [0.292, 0.045],
      [0.3, 0.044],
    ];
    for (let i = 1; i < profile.length; i++) {
      const [r, y] = profile[i];
      if (radius <= r) {
        const [r0, y0] = profile[i - 1];
        return THREE.MathUtils.lerp(y0, y, (radius - r0) / (r - r0));
      }
    }
    return 0.045;
  }

  beginResult(now) {
    this.state = "result";
    this.stateAt = now;
    this.scene.background = new THREE.Color(0xe8e2cf);
    this.boardScene.visible = false;
    this.appleRoot.visible = false;
    this.knife.visible = false;
    this.resultRoot.visible = true;
    this.plateTurntable.rotation.y = 0;
    this.resultRevealed = false;
    document.getElementById("resultStatus").textContent = "水果裝盤中…";
    document.getElementById("resultScorePanel").classList.remove("is-revealed");
    document.getElementById("resultScorePanel").inert = true;

    // 隨機打散切片順序；一個中心位置、八個環形位置。
    const pieces = this.savedPieces;
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    const angleOffset = Math.random() * Math.PI * 2;
    const slots = [{ x: 0, z: 0 }];
    for (let i = 0; i < Math.max(1, pieces.length - 1); i++) {
      const a =
        angleOffset + (i * Math.PI * 2) / Math.max(1, pieces.length - 1);
      const r = 0.193 + (Math.random() - 0.5) * 0.008;
      slots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    // 根據實際切片尺寸統一縮放，保留各片比例；限制水平包圍圓以免重疊。
    const point = new THREE.Vector3();
    let largestRadius = 0;
    for (const piece of pieces) {
      piece.rotateOnWorldAxis(
        new THREE.Vector3(0, 1, 0),
        Math.random() * Math.PI * 2,
      );
      for (const mesh of piece.children) {
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          point.fromBufferAttribute(pos, i).applyQuaternion(piece.quaternion);
          largestRadius = Math.max(largestRadius, Math.hypot(point.x, point.z));
        }
      }
    }
    const count = Math.max(1, pieces.length - 1);
    const safeRadius = Math.min(
      0.066,
      0.185 * Math.sin(Math.PI / Math.max(2, count)) - 0.006,
    );
    const scale = Math.min(
      FRUIT_SCALE,
      safeRadius / Math.max(0.001, largestRadius),
    );
    this.resultBodies = pieces.map((piece, index) => {
      const slot = slots[index];
      piece.scale.setScalar(scale);
      let floor = -Infinity;
      for (const mesh of piece.children) {
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          point
            .fromBufferAttribute(pos, i)
            .applyQuaternion(piece.quaternion)
            .multiplyScalar(scale);
          floor = Math.max(
            floor,
            this.plateHeight(Math.hypot(slot.x + point.x, slot.z + point.z)) -
              point.y,
          );
        }
      }
      floor += 0.001;
      piece.position.set(slot.x, floor + 0.31 + Math.random() * 0.12, slot.z);
      piece.visible = false;
      this.resultFruitRoot.add(piece);
      return {
        piece,
        floor,
        delay: 220 + index * 155,
        velocity: 0,
        settled: false,
      };
    });
    this.savedPieces = [];
    this.onResult?.();
    this.resize();
  }

  updateResult(now, delta) {
    const elapsed = now - this.stateAt;
    const dt = Math.max(0, Math.min(delta / 1000, 0.05));
    this.plateTurntable.rotation.y += dt * 0.48;
    for (const body of this.resultBodies) {
      if (elapsed < body.delay || body.settled) continue;
      body.piece.visible = true;
      body.velocity -= 3.2 * dt;
      body.piece.position.y += body.velocity * dt;
      if (body.piece.position.y <= body.floor) {
        body.piece.position.y = body.floor;
        if (body.velocity < -0.2) body.velocity *= -0.27;
        else {
          body.velocity = 0;
          body.settled = true;
        }
      }
    }
    if (!this.resultRevealed && this.resultBodies.every((b) => b.settled)) {
      this.resultRevealed = true;
      const max = this.queue.length * CUTS_PER_FRUIT * 100;
      // 分數換算成百分制（滿分 100）
      const finalScore = max > 0 ? Math.round((this.points / max) * 100) : 0;
      document.getElementById("resultPoints").textContent = finalScore;
      document.getElementById("resultMax").textContent = "/ 100";
      for (const grade of ["perfect", "good", "miss"]) {
        document.getElementById(`result-${grade}`).textContent =
          this.gradeCounts[grade];
      }
      document.getElementById("resultStatus").classList.add("is-finished");
      const panel = document.getElementById("resultScorePanel");
      panel.inert = false;
      panel.classList.add("is-revealed");
    }
  }

  getPosition(now) {
    // 三個關卡的打擊棒速度（毫秒）
    const levelSpeeds = [
      2000, // 第一關：慢速
      1200, // 第二關：中速
      800, // 第三關：快速
    ];

    const duration = levelSpeeds[this.fruitIndex] ?? 800;

    const cycle = ((now - this.stateAt) / duration) % 2;

    return cycle <= 1 ? cycle : 2 - cycle;
  }

  frame(now) {
    if (!this.active) return;

    const elapsed = now - this.stateAt;

    const delta =
      this.lastFrameTime === undefined ? 16 : now - this.lastFrameTime;

    this.lastFrameTime = now;

    if (this.state === "result") {
      this.updateResult(now, delta);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 每一幀更新水果重力與碰撞。
    this.updateFallingPieces(delta);

    if (this.state === "drop") {
      const t = Math.min(elapsed / 720, 1);

      this.appleRoot.position.y = BOARD_Y + 0.32 * (1 - t) * (1 - t);

      if (t === 1) {
        this.setZones(now);
      }
    } else if (this.state === "aim") {
      this.position = this.getPosition(now);

      this.pointer.style.left = `${this.position * 100}%`;
    } else if (this.state === "strike") {
      this.knife.position.y = BOARD_Y + 0.2 * (1 - Math.min(elapsed / 220, 1));

      if (elapsed >= 220) {
        this.splitPending(now);
      }
    } else if (this.state === "separate") {
      this.knife.position.y = BOARD_Y + 0.18 * Math.min(elapsed / 450, 1);

      // 留出時間讓切片自然倒下並停止。
      if (elapsed >= 1450) {
        this.knife.visible = false;

        if (this.cuts < CUTS_PER_FRUIT) {
          this.setZones(now, false);
        } else {
          this.state = "next";
          this.stateAt = now;

          this.feedback.textContent = "切好了！";
        }
      }
    } else if (this.state === "next" && elapsed >= 900) {
      this.saveRoundPieces();
      this.fruitIndex++;

      if (this.fruitIndex < this.queue.length) {
        this.spawnFruit(now);
      } else {
        this.beginResult(now);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
