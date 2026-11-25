// ========================================
// 西瓜果肉材質（3D 立體紋理）
// ----------------------------------------
// 用途：遊戲中即時切開西瓜時，切面要能顯示正確的果肉。
// 原理：每個頂點帶有 origin 屬性（切開前、在整顆西瓜上的原始座標），
//       著色器依這個 3D 位置決定顏色，所以不論從哪個角度、切在哪裡，
//       都會顯示那個位置真實的剖面：外層綠皮 → 白色瓜皮 → 紅色果肉，
//       以及在果肉裡一圈一圈排列的黑色種子。
// 座標：與 watermelon_whole_baked.glb 載入後的場景座標相同（y 朝上）。
//       遊戲中模型會再縮放、置中，但 origin 保留的是縮放前的原始座標。
// ========================================
import * as THREE from "three";

// 西瓜的形狀資訊（由 watermelon_whole.glb 量測）
// 數值以 watermelon_whole_baked.glb 載入後、套用 matrixWorld 的座標為準
const WATERMELON_SHAPE = {
  center: new THREE.Vector3(-0.11, 1.375, 0.0), // 西瓜中心
  axis: new THREE.Vector3(1, 0, 0), // 長軸方向（側躺，沿 X 軸）
  halfLength: 1.68, // 長軸半長
  radius: 1.37, // 短軸半徑
};

export function createWatermelonFleshMaterial(shape = WATERMELON_SHAPE) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0,
  });

  // 顏色（自動轉成線性色彩空間）
  const uniforms = {
    uCenter: { value: shape.center.clone() },
    uAxis: { value: shape.axis.clone() },
    uHalfLength: { value: shape.halfLength },
    uRadius: { value: shape.radius },
    uFleshDeep: { value: new THREE.Color("#d8262f") }, // 果肉中心：深紅
    uFleshLight: { value: new THREE.Color("#ef4a4d") }, // 果肉外側：亮紅
    uRindPink: { value: new THREE.Color("#f6a49a") }, // 紅白交界的淡粉色
    uRind: { value: new THREE.Color("#eef3cf") }, // 白色瓜皮
    uSkinLight: { value: new THREE.Color("#8fb85a") }, // 外皮內側淺綠
    uSkinDark: { value: new THREE.Color("#2f5a20") }, // 外皮深綠
    uSeed: { value: new THREE.Color("#1d1210") }, // 種子
    uSeedLight: { value: new THREE.Color("#5a3a2c") }, // 種子反光
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    // 頂點著色器：把原始座標傳給片段著色器
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 origin;
        varying vec3 vMelonOrigin;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vMelonOrigin = origin;`,
      );

    // 片段著色器：依 3D 位置計算果肉顏色
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vMelonOrigin;
        uniform vec3 uCenter, uAxis;
        uniform float uHalfLength, uRadius;
        uniform vec3 uFleshDeep, uFleshLight, uRindPink, uRind, uSkinLight, uSkinDark;
        uniform vec3 uSeed, uSeedLight;

        // 3D 雜湊函式：產生穩定的亂數
        vec3 melonHash3(vec3 p) {
          p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                   dot(p, vec3(269.5, 183.3, 246.1)),
                   dot(p, vec3(113.5, 271.9, 124.6)));
          return fract(sin(p) * 43758.5453);
        }

        // 細胞紋理：模擬果肉一顆顆晶瑩的果汁囊
        float melonCells(vec3 p) {
          vec3 cell = floor(p);
          vec3 local = fract(p);
          float nearest = 1.0;
          for (int x = -1; x <= 1; x++)
          for (int y = -1; y <= 1; y++)
          for (int z = -1; z <= 1; z++) {
            vec3 offset = vec3(float(x), float(y), float(z));
            vec3 point = offset + melonHash3(cell + offset);
            nearest = min(nearest, length(point - local));
          }
          return nearest;
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // 換算成西瓜自己的座標：t = 沿長軸位置，radial = 離中軸的距離
        vec3 p = vMelonOrigin - uCenter;
        float t = dot(p, uAxis);
        vec3 radialVec = p - t * uAxis;
        float radial = length(radialVec);

        // 橢圓體距離：0 = 正中心，1 = 外皮表面
        float shell = length(vec2(t / uHalfLength, radial / uRadius));

        // 果肉：中心深紅，往外變亮
        vec3 color = mix(uFleshDeep, uFleshLight, smoothstep(0.1, 0.8, shell));

        // 果汁囊的顆粒感
        float cells = melonCells(vMelonOrigin * 22.0);
        color *= 0.93 + 0.12 * smoothstep(0.15, 0.75, cells);

        // 由內到外：淡粉交界 → 白色瓜皮 → 淺綠 → 深綠外皮
        color = mix(color, uRindPink, smoothstep(0.84, 0.885, shell));
        color = mix(color, uRind, smoothstep(0.88, 0.91, shell));
        color = mix(color, uSkinLight, smoothstep(0.945, 0.965, shell));
        color = mix(color, uSkinDark, smoothstep(0.975, 0.995, shell));

        // 種子：沿著長軸一層一層、每層一圈排列，只長在紅色果肉裡
        // 建立垂直於長軸的參考方向
        vec3 sideA = normalize(cross(uAxis, abs(uAxis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 sideB = cross(uAxis, sideA);
        float angle = atan(dot(radialVec, sideB), dot(radialVec, sideA));

        float layerSize = 0.17; // 每層種子沿長軸的間距
        float localRadius = uRadius * sqrt(max(1.0 - (t / uHalfLength) * (t / uHalfLength), 0.0));

        float seedMask = 0.0;
        float seedShade = 0.0;
        float layerIndex = floor(t / layerSize);
        // 兩圈種子：內圈較少、外圈較多
        for (int ring = 0; ring < 2; ring++) {
        float seedsPerRing = ring == 0 ? 7.0 : 12.0;
        float ringBase = ring == 0 ? 0.4 : 0.64;
        for (int dl = 0; dl <= 1; dl++) {
          float layer = layerIndex + float(dl);
          float layerT = layer * layerSize;
          float twist = mod(layer, 2.0) * 0.5; // 相鄰兩層錯開半格
          float slot = floor(angle / 6.2831853 * seedsPerRing - twist + 0.5);
          vec3 rnd = melonHash3(vec3(layer, slot, 3.1 + float(ring) * 7.0));
          if (rnd.z < (ring == 0 ? 0.45 : 0.2)) continue; // 隨機缺幾顆，比較自然

          float seedAngle = (slot + twist + (rnd.x - 0.5) * 0.35) / seedsPerRing * 6.2831853;
          float seedT = layerT + (rnd.y - 0.5) * 0.08;
          float ringRadius = localRadius * (ringBase + 0.08 * rnd.x);

          // 種子中心與方向（尖端朝外）
          vec3 outward = cos(seedAngle) * sideA + sin(seedAngle) * sideB;
          vec3 tangent = cross(uAxis, outward);
          vec3 seedCenter = seedT * uAxis + outward * ringRadius;
          vec3 d = p - seedCenter;

          float along = dot(d, outward); // 長度方向
          float taper = 1.0 - 0.55 * clamp(along / 0.085 + 0.2, 0.0, 1.0); // 外側較尖
          float seed = length(vec3(along / 0.085, dot(d, tangent) / (0.05 * taper), dot(d, uAxis) / 0.05));
          float mask = 1.0 - smoothstep(0.82, 1.0, seed);
          if (mask > seedMask) {
            seedMask = mask;
            seedShade = 1.0 - smoothstep(0.0, 0.7, seed);
          }
        }
        }
        seedMask *= 1.0 - smoothstep(0.75, 0.82, shell); // 種子只在紅色果肉範圍內
        vec3 seedColor = mix(uSeed, uSeedLight, seedShade * 0.4);
        color = mix(color, seedColor, seedMask);

        diffuseColor.rgb = color;`,
      )
      // 果肉比較濕潤有光澤，種子則較光滑
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, seedMask);`,
      );
  };

  // 讓 three.js 把它視為獨立的著色器版本
  material.customProgramCacheKey = () => "watermelon-flesh-3d";

  return material;
}
