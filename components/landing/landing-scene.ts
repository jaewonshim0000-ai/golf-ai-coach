import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/*
  The desktop landing page's putting green, ported from the igloo-inc craft.
  One screen with no page scroll: the wheel, touch and keys roll the ball along
  an 18 ft putt into the cup while the three chapter slides take turns; a click
  on the green putts the ball for real. Everything is drawn in code (no image or
  audio files).

  `startLandingScene` builds the scene inside the landing markup and returns a
  function that stops it and frees the GPU context, listeners, timers and audio,
  so the page can mount and unmount it (React StrictMode does both at once).
*/

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.5 + noise(x * 2.1, y * 2.1) * 0.25 + noise(x * 4.3, y * 4.3) * 0.125;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// --- terrain: value-noise hills, a flattened green around the hole, one bunker
const GREEN_R = 7, BUNKER = new THREE.Vector2(-6.5, 4.5);
function height(x: number, z: number) {
  const r = Math.hypot(x, z);
  const hills = (fbm(x * 0.06 + 3, z * 0.06 + 7) - 0.45) * 9 + Math.max(0, r - 18) * 0.12;
  const green = 0.08 * Math.sin(x * 0.35) + 0.06 * Math.cos(z * 0.4); // gentle putting break
  const t = smooth(THREE.MathUtils.clamp((r - GREEN_R) / 10, 0, 1));
  let h = green + (hills - green) * t + fbm(x * 0.8, z * 0.8) * 0.12 * t;
  const bd = Math.hypot((x - BUNKER.x) / 2.6, (z - BUNKER.y) / 1.6);
  if (bd < 1) h -= 0.45 * smooth(1 - bd);
  return h;
}
function surface(x: number, z: number) { // 0 green, 1 rough, 2 sand
  if (Math.hypot((x - BUNKER.x) / 2.6, (z - BUNKER.y) / 1.6) < 0.85) return 2;
  return Math.hypot(x, z) < GREEN_R + fbm(x * 0.5, z * 0.5) * 1.5 ? 0 : 1;
}
const slope = (x: number, z: number) => new THREE.Vector2((height(x + 0.05, z) - height(x - 0.05, z)) / 0.1, (height(x, z + 0.05) - height(x, z - 0.05)) / 0.1);
const lift = (x: number, z: number, y = 0.03) => new THREE.Vector3(x, height(x, z) + y, z);

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
function canvasTex(w: number, h: number, draw: Draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { t, redraw: () => { draw(g, w, h); t.needsUpdate = true; } };
}

export function startLandingScene(root: HTMLElement): () => void {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const signal = new AbortController();
  const opts = { signal: signal.signal }, passive = { passive: true, signal: signal.signal };
  let toastTimer: ReturnType<typeof setTimeout> | undefined, respawnTimer: ReturnType<typeof setTimeout> | undefined;

  // A fresh canvas per start: a WebGL context can't be handed to a second renderer once the first is disposed.
  const canvas = document.createElement("canvas");
  canvas.id = "scene"; canvas.setAttribute("aria-hidden", "true");
  root.prepend(canvas);
  const labelsEl = $("#labels");
  // next/font gives the headline face a generated family name; read it so the flag can print in it
  const display = `${getComputedStyle(root).getPropertyValue("--font-anton").trim() || "Anton"}, Impact, sans-serif`;

  const sfx = soundscape();

  const FOG = new THREE.Color("#e2ded2");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = canvasTex(2, 256, (g) => { // misty sky: lighter at the top
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#f2f0e8"); gr.addColorStop(0.6, "#e2ded2"); gr.addColorStop(1, "#d3cfc1");
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  }).t;
  scene.fog = new THREE.Fog(FOG, 5, 21);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);

  // --- lights
  scene.add(new THREE.HemisphereLight("#fffaf0", "#46503a", 1.35));
  const sun = new THREE.DirectionalLight("#fff4dc", 2.0);
  sun.position.set(8, 12, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // tiling turf: thousands of tiny blade strokes, tinted by the vertex colours
  const grain = canvasTex(512, 512, (g, S) => {
    g.fillStyle = "rgb(205,205,205)"; g.fillRect(0, 0, S, S);
    g.lineCap = "round";
    for (let n = 0; n < 14000; n++) {
      const x = Math.random() * S, y = Math.random() * S, len = 3 + Math.random() * 6, a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const v = 150 + Math.random() * 105 | 0;
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.6 + Math.random() * 0.9;
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { // drawn wrapped so the tile is seamless
        g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); g.stroke();
      }
    }
  }).t;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(110, 110); grain.anisotropy = 8;

  const geo = new THREE.PlaneGeometry(160, 160, 320, 320).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position!, colors: number[] = [];
  const C = [new THREE.Color("#7f9c48"), new THREE.Color("#4f6826"), new THREE.Color("#e6dcc0")]; // green, rough, sand
  const tmp = new THREE.Color(), FRINGE = new THREE.Color("#678a34");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, height(x, z));
    const s = surface(x, z);
    tmp.copy(C[s]!);
    const edge = GREEN_R + fbm(x * 0.5, z * 0.5) * 1.5 - Math.hypot(x, z); // distance inside the green's edge
    if (s === 0 && edge < 0.8) tmp.lerp(FRINGE, 1 - edge / 0.8); // collar of slightly longer, darker grass
    else if (s === 0) tmp.offsetHSL(0, 0, Math.sin(x * 1.2 + z * 0.4) > 0 ? 0.025 : -0.015); // mowing stripes
    else if (s === 1) tmp.offsetHSL(0.01 * (fbm(x * 0.7, z * 0.7) - 0.5), 0, (fbm(x * 0.3, z * 0.3) - 0.45) * 0.14);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, bumpMap: grain, bumpScale: 0.8, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // --- the hole, flagstick, flag, ball
  const H0 = height(0, 0);
  // soft studio reflections for the glossy things (ball, flagstick) only; the grass stays matte
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // cup: painted to read as a recessed hole: white liner lip, lit far wall, dark bottom
  const cupTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = "#070806"; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    const wall = g.createRadialGradient(c, c * 1.25, c * 0.35, c, c, c); // far side of the inner wall catches light
    wall.addColorStop(0, "rgba(0,0,0,0)"); wall.addColorStop(0.75, "rgba(60,62,55,.0)"); wall.addColorStop(1, "rgba(120,122,112,.55)");
    g.fillStyle = wall; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#e9e8e0"; g.lineWidth = w * 0.07; g.beginPath(); g.arc(c, c, c - w * 0.035, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); // liner, seen on the far rim
  }).t;
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.108, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: cupTex }));
  cup.position.set(0, H0 + 0.006, 0);
  cup.rotation.y = Math.atan2(4.2, 3.6); // turn the lit wall to the far side, as seen from the opening putt (START below)
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.108, 0.118, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#5d7a2c", roughness: 1 })); // trimmed turf lip
  rim.position.copy(cup.position);
  scene.add(cup, rim);

  // flagstick: glossy fibreglass with a ferrule at the base and a cap on top
  const stickMat = new THREE.MeshPhysicalMaterial({ color: "#f7f5ee", roughness: 0.25, clearcoat: 0.8, envMap, envMapIntensity: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 2.4, 20), stickMat);
  pole.position.set(0, H0 + 1.2, 0);
  pole.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 10), stickMat);
  cap.position.set(0, H0 + 2.41, 0);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 16), new THREE.MeshStandardMaterial({ color: "#8a8f86", metalness: 0.9, roughness: 0.3, envMap }));
  ferrule.position.set(0, H0 + 0.02, 0);
  scene.add(pole, cap, ferrule);

  // flag: woven nylon with a stitched sleeve, hemmed edges and a printed hole number
  const FW = 0.9, FH = 0.58;
  const flagArt = canvasTex(512, 330, (g, w, h) => {
    g.fillStyle = "#e8c547"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(120,90,10,${0.05 + Math.random() * 0.05})`; g.fillRect(0, y, w, 1); } // weave
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,250,220,${0.03 + Math.random() * 0.04})`; g.fillRect(x, 0, 1, h); }
    g.fillStyle = "rgba(150,110,15,.35)"; g.fillRect(0, 0, 34, h); // sleeve around the pole
    g.strokeStyle = "rgba(110,80,10,.6)"; g.setLineDash([6, 5]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(38, 0); g.lineTo(38, h); g.stroke();
    for (const y of [9, h - 9]) { g.beginPath(); g.moveTo(40, y); g.lineTo(w, y); g.stroke(); }
    g.beginPath(); g.moveTo(w - 9, 0); g.lineTo(w - 9, h); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#1e211b"; g.font = `400 210px ${display}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("18", w * 0.56, h * 0.53);
  });
  document.fonts.load(`400 210px ${display}`).then(flagArt.redraw, () => {}); // repaint once the headline font is ready
  const flagGeo = new THREE.PlaneGeometry(FW, FH, 36, 18).translate(FW / 2, 0, 0);
  const flagRest = flagGeo.attributes.position!.array.slice();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagArt.t, side: THREE.DoubleSide, roughness: 0.85, emissive: "#3a2d06", emissiveIntensity: 0.6 }));
  flag.position.set(0.015, H0 + 2.4 - FH / 2 - 0.02, 0);
  flag.castShadow = true;
  scene.add(flag);

  // ball: hex-packed dimples as a bump map under a glossy clear coat
  const dimples = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
    const dx = w / 46, r = dx / 2.05, dy = r * 1.78; // whole number of dimples around, so the pattern wraps without a seam
    for (let row = 0, y = 0; y < h + r; y += dy, row++) for (let x = (row % 2) * dx / 2; x < w + r; x += dx) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "#3c3c3c"); gr.addColorStop(0.75, "#6a6a6a"); gr.addColorStop(1, "#808080");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }).t;
  dimples.colorSpace = THREE.NoColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 64, 40), new THREE.MeshPhysicalMaterial({
    color: "#fbfbf6", roughness: 0.42, bumpMap: dimples, bumpScale: 1.4, clearcoat: 1, clearcoatRoughness: 0.12, envMap, envMapIntensity: 0.7,
  }));
  ball.castShadow = true;
  ball.renderOrder = 2; // drawn after the always-on-top putting lines, so the line passes under the ball, not over it
  scene.add(ball);

  // --- the scroll putt: the ball rolls along a breaking line into the cup as you scroll.
  // It starts as an 18 ft putt; after the player putts, scrolling continues from wherever the ball stopped.
  const START = new THREE.Vector2(4.2, 3.6), N = 240;
  // depthTest off: the lines lie on the grass and must not sink into the terrain mesh between its vertices
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#1e211b", transparent: true, opacity: 0.8, fog: false, depthTest: false, depthWrite: false }));
  const ahead = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: "#f2f0e8", dashSize: 0.1, gapSize: 0.07, fog: false, depthTest: false, depthWrite: false }));
  trail.renderOrder = ahead.renderOrder = 1;
  scene.add(trail, ahead);
  const q2 = new THREE.Vector2(), tan2 = new THREE.Vector2(), v = new THREE.Vector3();
  let path = new THREE.SplineCurve(), PATH_LEN = 1, pathCups = 0;
  const pathFrom = new THREE.Vector2(), pathStart3 = new THREE.Vector3();

  // distance markers along the putt; each dims once the ball rolls past it
  const marks: [number, string][] = [[15, "Pace check · firm stroke"], [10, "Break starts here"], [6, "Slope 1.4% · downhill"], [3, "Die it in the front edge"]];
  const tags = marks.map(([ft, tip]) => {
    const el = document.createElement("span"); el.className = "tag"; el.textContent = `${ft} ft`; el.dataset.tip = tip; el.tabIndex = 0;
    labelsEl.append(el); return { el, ft, p: new THREE.Vector3(), u: 0 };
  });
  function placeTags() { // markers sit at their distance from the cup; ones farther than the putt are hidden
    for (const tg of tags) {
      tg.u = 1 - tg.ft / 3.281 / PATH_LEN;
      if (tg.u < 0) continue;
      path.getPointAt(tg.u, q2);
      tg.p.copy(lift(q2.x, q2.y, 0.02));
    }
  }
  function buildPath(from: THREE.Vector2) { // same bend as the opening putt, scaled to the distance left
    const d = from.length(), k = d / START.length(), side = new THREE.Vector2(-from.y, from.x).normalize();
    path = new THREE.SplineCurve(d > 1
      ? [from.clone(), from.clone().multiplyScalar(0.66).addScaledVector(side, 0.45 * k), from.clone().multiplyScalar(0.33).addScaledVector(side, 0.35 * k), new THREE.Vector2()]
      : [from.clone(), new THREE.Vector2()]); // short putts: straight in
    PATH_LEN = path.getLength();
    pathCups = d > 1 ? Math.max(1, Math.round((0.45 * k) / 0.108)) : 0;
    pathFrom.copy(from);
    pathStart3.copy(lift(from.x, from.y, 0.045));
    const pts = path.getSpacedPoints(N).map((q) => lift(q.x, q.y, 0.012));
    for (const line of [trail, ahead]) { line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(pts); }
    ahead.computeLineDistances();
    placeTags();
  }
  function placeOnPath(u: number) { // ball at fraction u of the putt's length, rolling as it goes
    path.getPointAt(u, q2); path.getTangentAt(Math.min(u, 0.999), tan2);
    ball.position.set(q2.x, height(q2.x, q2.y) + 0.045, q2.y);
    ball.quaternion.setFromAxisAngle(v.set(tan2.y, 0, -tan2.x).normalize(), (u * PATH_LEN) / 0.045);
    const n = Math.round(u * N);
    trail.geometry.setDrawRange(0, n + 1);
    ahead.geometry.setDrawRange(n, N + 1 - n);
  }
  buildPath(START);
  placeOnPath(0);

  const readLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#1e211b", transparent: true, opacity: 0.6, fog: false, depthTest: false }));
  scene.add(readLine);
  const read = { dist: 0, side: "", cups: 0 };
  function drawRead() { // coach's suggested line: bends against the slope across the putt
    const bx = ball.position.x, bz = ball.position.z, dist = Math.hypot(bx, bz);
    const perp = new THREE.Vector2(-bz, bx).normalize();
    const g = slope(bx / 2, bz / 2).dot(perp);
    const off = THREE.MathUtils.clamp(g * dist * 1.5, -0.8, 0.8);
    const curve = new THREE.CatmullRomCurve3([lift(bx, bz), lift(bx / 2 + perp.x * off, bz / 2 + perp.y * off), lift(0, 0)]);
    readLine.geometry.setFromPoints(curve.getPoints(60));
    Object.assign(read, { dist, side: off > 0 ? "R" : "L", cups: Math.max(0, Math.round(Math.abs(off) / 0.108)) });
  }
  drawRead();
  readLine.visible = false; // only shown in free play; the scroll putt has its own line

  const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: "#5c7a2a", dashSize: 0.08, gapSize: 0.06, fog: false, depthTest: false }));
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#5c7a2a", fog: false }));
  aimLine.visible = aimRing.visible = false;
  scene.add(aimLine, aimRing);

  // drifting specks in the mist
  const specks = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 400 }, () => new THREE.Vector3((Math.random() - 0.5) * 40, Math.random() * 10, (Math.random() - 0.5) * 40))),
    new THREE.PointsMaterial({ color: "#ffffff", size: 0.04, transparent: true, opacity: 0.7 }));
  scene.add(specks);

  // blades of rough grass around the green: tapered, curved, darker at the root, swaying with the live wind
  const dummy = new THREE.Object3D();
  const BLADE_H = 0.26;
  const bladeGeo = new THREE.PlaneGeometry(0.032, BLADE_H, 1, 4).translate(0, BLADE_H / 2, 0);
  {
    const p = bladeGeo.attributes.position!;
    for (let n = 0; n < p.count; n++) { const k = p.getY(n) / BLADE_H; p.setX(n, p.getX(n) * (1 - k * 0.9)); p.setZ(n, k * k * 0.07); }
    bladeGeo.computeVertexNormals();
  }
  const grassU = { uTime: { value: 0 }, uWind: { value: 0.7 } };
  const bladeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.9 });
  bladeMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassU);
    sh.vertexShader = `uniform float uTime; uniform float uWind; varying float vBladeH;\n${sh.vertexShader}`.replace("#include <begin_vertex>", `#include <begin_vertex>
      float bh = position.y / ${BLADE_H.toFixed(2)};
      vBladeH = bh;
      vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.7 + root.x * 0.8 + root.z * 0.6) + 0.45 * sin(uTime * 3.3 + root.x * 2.1);
      transformed.x += sway * 0.04 * uWind * bh * bh;
      transformed.z += (0.6 + 0.4 * sway) * 0.03 * uWind * bh * bh;`);
    sh.fragmentShader = `varying float vBladeH;\n${sh.fragmentShader}`.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb *= mix(0.42, 1.08, vBladeH);");
  };
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, 12000);
  for (let n = 0; n < blades.count; n++) {
    const ang = rnd(0, Math.PI * 2), r = GREEN_R + 0.9 + Math.pow(Math.random(), 0.8) * 10, x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (Math.hypot((x - BUNKER.x) / 2.6, (z - BUNKER.y) / 1.6) < 1.05) { n--; continue; } // no grass in the sand
    dummy.position.set(x, height(x, z) - 0.01, z); dummy.rotation.set(rnd(-0.25, 0.25), rnd(0, Math.PI * 2), rnd(-0.25, 0.25));
    const s = rnd(0.55, 1.35); dummy.scale.set(s, s * rnd(0.8, 1.3), s);
    dummy.updateMatrix(); blades.setMatrixAt(n, dummy.matrix);
    blades.setColorAt(n, tmp.set(Math.random() < 0.12 ? "#8a8f45" : "#4f6826").offsetHSL(rnd(-0.015, 0.015), rnd(-0.05, 0.05), rnd(-0.05, 0.07)));
  }
  scene.add(blades);

  // soft light haze in the upper-right sky
  const hazeTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,250,235,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }).t;
  const haze = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, map: hazeTex }));
  haze.position.set(14, 9, -30);
  haze.scale.set(60, 40, 1);
  scene.add(haze);

  // --- camera chases the ball: high and wide at the start, low by the cup at the end
  const CUP = new THREE.Vector3(0, H0, 0);
  const back = new THREE.Vector3(), camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  function chase(u: number, from: THREE.Vector3) {
    path.getTangentAt(Math.min(u, 0.999), tan2);
    back.set(-tan2.x, 0, -tan2.y);
    camPos.copy(from).addScaledVector(back, THREE.MathUtils.lerp(4.4, 2.2, u));
    camPos.y += THREE.MathUtils.lerp(2.3, 0.85, u);
    camTgt.lerpVectors(from, CUP, THREE.MathUtils.lerp(0.45, 1, u));
    camTgt.y = H0 + THREE.MathUtils.lerp(0.75, 0.15, u);
  }
  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  addEventListener("pointermove", (e) => mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5), passive);

  const hudBottom = $(".hud-bottom p");
  const chapters = [...root.querySelectorAll<HTMLElement>(".chapter")];
  // One screen, no page scroll: wheel / touch / keys roll the ball along the putt.
  const MAX = 3; // intro + three chapters
  let goal = 0;
  const nudge = (d: number) => { goal = THREE.MathUtils.clamp(goal + d, 0, MAX); };
  addEventListener("wheel", (e) => nudge(e.deltaY / 900), passive);
  let touchY = 0;
  addEventListener("touchstart", (e) => { touchY = e.touches[0]!.clientY; }, passive);
  addEventListener("touchmove", (e) => { const y = e.touches[0]!.clientY; nudge((touchY - y) / innerHeight * 1.6); touchY = y; }, passive);
  const STEPS: Record<string, number> = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 };
  addEventListener("keydown", (e) => {
    if (e.key === " " && e.target instanceof HTMLElement && e.target.closest("a, button")) return; // Space presses the focused control
    const step = STEPS[e.key];
    if (step) { goal = THREE.MathUtils.clamp(Math.round(goal) + step, 0, MAX); e.preventDefault(); }
    if (e.key === "Home") goal = 0;
    if (e.key === "End") goal = MAX;
  }, opts);
  const scrollProgress = () => goal / MAX;

  // --- mini putting game: point at the green to aim, click / tap to putt
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aim = new THREE.Vector3();
  function groundPoint(cx: number, cy: number) { // ray vs terrain: start on a flat plane, refine with the real height
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const { origin: o, direction: d } = ray.ray;
    if (d.y >= -0.01) return null;
    let y = H0;
    for (let n = 0; n < 4; n++) { aim.copy(o).addScaledVector(d, (y - o.y) / d.y); y = height(aim.x, aim.z); }
    aim.y = y;
    return aim;
  }
  const MU = 0.6; // green friction, m/s²; stronger than the steepest slope pull (~0.2) so a ball always comes to rest
  // free = the player has putted the ball off the scroll line (only possible at the very start)
  const game = { vel: new THREE.Vector2(), rolling: false, holed: false, free: false, putts: 0, made: 0, rollT: 0 };
  const playable = () => goal < 0.02 && !game.rolling && !game.holed;
  function resumeFrom(from: THREE.Vector2) { // hand the ball back to the scroll putt, starting at `from`
    buildPath(from);
    Object.assign(game, { free: false, rolling: false, holed: false });
    game.vel.set(0, 0);
    readLine.visible = false; trail.visible = ahead.visible = true;
  }
  function continueFromBall() { // scrolling after putting: carry on from where the ball is now
    const at = new THREE.Vector2(ball.position.x, ball.position.z);
    if (game.holed || at.length() < 0.15) { game.putts = 0; resumeFrom(START); } // already in: a fresh putt
    else resumeFrom(at);
    smoothP = 0; // progress now counts from the ball's current spot
  }
  const toastEl = $("#toast");
  function toast(msg: string) {
    toastEl.textContent = msg; toastEl.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2200);
  }

  canvas.addEventListener("pointermove", (e) => {
    const pt = playable() ? groundPoint(e.clientX, e.clientY) : null;
    const show = !!pt && pt.distanceTo(ball.position) < 9;
    aimLine.visible = aimRing.visible = show;
    if (!pt || !show) return;
    aimLine.geometry.setFromPoints([ball.position.clone().setY(ball.position.y + 0.01), pt.clone().setY(pt.y + 0.02)]);
    aimLine.computeLineDistances();
    aimRing.position.set(pt.x, pt.y + 0.015, pt.z);
  }, opts);
  let downAt: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; }, opts);
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8 || !playable()) return;
    const pt = groundPoint(e.clientX, e.clientY);
    if (!pt) return;
    const dx = pt.x - ball.position.x, dz = pt.z - ball.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 9) return;
    game.vel.set(dx / d, dz / d).multiplyScalar(Math.sqrt(2 * MU * d)); // steady friction: rolls out exactly to the point you picked
    game.rolling = true; game.free = true; game.rollT = 0; game.putts++;
    aimLine.visible = aimRing.visible = readLine.visible = trail.visible = ahead.visible = false;
    sfx.putt(Math.min(1, 0.35 + d / 6)); // harder strokes for longer putts
  }, opts);
  function respawn() { // after holing or rolling off: a fresh putt from the start (unless the player already scrolled on)
    if (!game.free) return;
    game.putts = 0;
    resumeFrom(START);
  }
  function stepBall(dt: number) {
    if (!game.free) return;
    const b = ball.position;
    if (game.holed) { b.y = Math.max(H0 - 0.08, b.y - dt * 0.6); return; }
    if (!game.rolling) return;
    game.vel.addScaledVector(slope(b.x, b.z), -9.8 * 0.5 * dt);
    const sp = game.vel.length();
    if (sp > MU * dt) game.vel.multiplyScalar(1 - (MU * dt) / sp); else game.vel.set(0, 0);
    game.rollT += dt;
    b.x += game.vel.x * dt; b.z += game.vel.y * dt;
    b.y = height(b.x, b.z) + 0.045;
    ball.rotation.x += (game.vel.y * dt) / 0.045; ball.rotation.z -= (game.vel.x * dt) / 0.045;
    const toCup = Math.hypot(b.x, b.z), speed = game.vel.length();
    if (toCup < 0.1 && speed < 1.4) { // dropped in
      game.rolling = false; game.holed = true; game.made++;
      b.x = b.z = 0;
      toast(game.putts === 1 ? "In the hole. One putt!" : `Holed in ${game.putts}. Nice touch.`);
      sfx.cup();
      respawnTimer = setTimeout(respawn, 2400);
    } else if (speed === 0 || toCup > 11 || game.rollT > 10) { // rollT: safety stop on steep rough
      game.rolling = false;
      if (toCup > 11) respawn(); else { readLine.visible = true; drawRead(); }
    }
  }

  // --- live coach panel, wind and chapter dots
  const coach = { pin: $("[data-c=pin]"), brk: $("[data-c=brk]"), pace: $("[data-c=pace]"), wind: $("[data-c=wind]"), putts: $("[data-c=putts]") };
  const dots = [...root.querySelectorAll<HTMLButtonElement>(".dots button")];
  dots.forEach((d, n) => d.addEventListener("click", () => { goal = n; }, opts));
  let wind = 6;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 52 : 38; // portrait screens: widen so the flag still fits
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize, passive);
  resize();

  const btn = $<HTMLButtonElement>("#sound");
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector("b")!.textContent = on ? "On" : "Off";
    sfx.toggle(on);
  }, opts);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let smoothP = scrollProgress(), sunk = false, scrollSide = "L";
  const camPosS = new THREE.Vector3(), camTgtS = new THREE.Vector3();
  let camEase = 1; // first frame snaps into place, then eases
  const viewOff = new THREE.Vector2(); // screen-space shift of the 3D view, px
  const lastBall = new THREE.Vector3(); let rollSpeed = 0, lastActive = -1;
  const DROP = 0.96; // the ball reaches the cup here; the rest of the scroll it drops in
  renderer.setAnimationLoop(() => {
    const rawDt = Math.min(clock.getDelta(), 0.5), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime;
    const ease = (rate: number) => 1 - Math.exp(-rate * rawDt); // time-based smoothing: same feel at any frame rate
    wind = 3 + noise(t * 0.08, 1.3) * 11;
    smoothP += (scrollProgress() - smoothP) * ease(5);
    if (game.free && goal >= 0.02) continueFromBall(); // scrolling picks up the putt from where the ball lies
    const u = Math.min(smoothP / DROP, 1);
    if (game.free) stepBall(dt);
    else {
      placeOnPath(u);
      if (smoothP > DROP) ball.position.y -= ((smoothP - DROP) / (1 - DROP)) * 0.12;
      if (smoothP > 0.985 && !sunk) { sunk = true; toast("In the hole. Read it, roll it."); sfx.cup(); }
      if (smoothP < 0.9) sunk = false;
    }
    chase(game.free ? 0 : u, game.free ? pathStart3 : ball.position); // free play: camera holds the view it had when you putted
    if (camera.aspect < 1) camPos.sub(camTgt).multiplyScalar(1.25).add(camTgt); // portrait: step back so ball and flag both fit
    mouseS.lerp(mouse, 0.05);
    // ease the camera toward its pose so a new putting line (or any jump) glides instead of cutting
    camPosS.lerp(camPos, camEase); camTgtS.lerp(camTgt, camEase); camEase = ease(7.5);
    camera.position.copy(camPosS).add(v.set(mouseS.x * 0.6, -mouseS.y * 0.3, 0));
    camera.lookAt(camTgtS);

    // flag: travelling ripples that grow toward the free edge, a flutter at the tip, and a sag when the wind drops
    const a = flagGeo.attributes.position!, wn = THREE.MathUtils.clamp((wind - 3) / 11, 0, 1);
    for (let j = 0; j < a.count; j++) {
      const x = flagRest[j * 3]!, y = flagRest[j * 3 + 1]!, w = x / FW;
      if (reduce) { a.setZ(j, w * 0.08); continue; }
      const speed = 2.2 + wind * 0.35;
      const ripple = Math.sin(x * 7 - t * speed + y * 1.6) * 0.075 + Math.sin(x * 15 - t * speed * 1.9 + y * 4) * 0.022 * w;
      const flutter = Math.sin(t * 13 + y * 9) * 0.012 * w * w * wn;
      const z = (ripple * (0.5 + wn * 0.7) + flutter) * Math.pow(w, 1.2);
      a.setXYZ(j, x * (1 - Math.abs(z) * 0.35), y - (1 - wn) * w * w * 0.16 * (0.5 - y / FH + 0.5), z); // sag pulls the free corner down
    }
    a.needsUpdate = true;
    flagGeo.computeVertexNormals();
    grassU.uTime.value = t; grassU.uWind.value = reduce ? 0 : 0.35 + wn * 1.1;

    // ball speed (across the green, not the drop into the cup) drives the rolling sound
    rollSpeed = v.copy(ball.position).setY(0).distanceTo(lastBall) / Math.max(dt, 1e-3);
    lastBall.copy(ball.position).setY(0);
    sfx.update(wind, rollSpeed);

    if (!reduce) specks.rotation.y = t * 0.02;

    for (const { el, p, u: at } of tags) {
      v.copy(p).project(camera);
      const vis = !game.free && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.opacity = String(vis ? (at < u ? 0.35 : 1) : 0); // dims once the ball has rolled past
      el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth + 6}px, ${((1 - v.y) / 2) * innerHeight - 14}px)`;
    }
    hudBottom.style.opacity = String(Math.max(0, 1 - goal * 4));
    const active = Math.round(smoothP * MAX) - 1;
    chapters.forEach((c, n) => c.classList.toggle("on", n === active));
    if (active !== lastActive) { if (active >= 0) sfx.tick(); lastActive = active; }
    dots.forEach((d, n) => d.setAttribute("aria-current", String(n === active + 1)));
    // slide open: shift the 3D view into the free space beside (or above) it so the ball stays visible
    const panel = chapters[active]?.querySelector(".panel");
    let tx = 0, ty = 0;
    if (panel) {
      const r = panel.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      if (r.width > W * 0.6) ty = r.top / 2 - H / 2; // wide slide: use the space above it
      else tx = r.left + r.width / 2 > W / 2 ? r.left / 2 - W / 2 : (r.right + W) / 2 - W / 2;
    }
    viewOff.x += (tx - viewOff.x) * ease(5); viewOff.y += (ty - viewOff.y) * ease(5);
    camera.setViewOffset(innerWidth, innerHeight, -viewOff.x, -viewOff.y, innerWidth, innerHeight);
    root.classList.toggle("deep", goal > 0.3);
    const live = Math.hypot(ball.position.x, ball.position.z);
    const inCup = game.holed || (!game.free && u >= 1);
    coach.pin.textContent = inCup ? "in the cup" : `${(live * 3.281).toFixed(1)} ft`;
    if (game.free) coach.brk.textContent = game.rolling ? "rolling…" : read.cups ? `${read.cups} cup${read.cups > 1 ? "s" : ""} ${read.side}` : "straight";
    else { // scroll putt: which way the line bulges on screen, read from the opening view
      if (u < 0.05) {
        path.getPointAt(0.5, q2); v.set(q2.x, H0, q2.y).project(camera); const bx = v.x;
        v.set(pathFrom.x / 2, H0, pathFrom.y / 2).project(camera);
        scrollSide = bx > v.x ? "R" : "L";
      }
      coach.brk.textContent = inCup ? "–" : pathCups ? `${pathCups} cup${pathCups > 1 ? "s" : ""} ${scrollSide}` : "straight";
    }
    coach.pace.textContent = inCup ? "perfect" : live > 3 ? "firm" : live > 1.5 ? "medium" : "die it in";
    coach.wind.textContent = `${wind.toFixed(0)} mph NE`;
    coach.putts.textContent = `${game.putts} · holed ${game.made}`;
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    signal.abort();
    clearTimeout(toastTimer); clearTimeout(respawnTimer);
    sfx.close();
    renderer.dispose();
    renderer.forceContextLoss(); // frees the GPU now rather than whenever the canvas is collected
    canvas.remove();
    labelsEl.replaceChildren();
    root.classList.remove("deep");
  };
}

/**
 * A small procedural soundscape, silent until the visitor turns it on: stereo
 * wind that gusts with the live wind reading, birdsong, putter tock, rolling
 * rumble, cup rattle and slide ticks.
 */
function soundscape() {
  let ctx: AudioContext | undefined, master: GainNode, windGain: GainNode, windLP: BiquadFilterNode, rollGain: GainNode | undefined;
  let noiseBuf: AudioBuffer, on = false, birdTimer: ReturnType<typeof setTimeout> | undefined;
  function init(c: AudioContext) {
    const sr = c.sampleRate;
    master = c.createGain(); master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); master.connect(comp).connect(c.destination);
    noiseBuf = c.createBuffer(1, sr * 2, sr);
    noiseBuf.getChannelData(0).forEach((_, i, d) => { d[i] = Math.random() * 2 - 1; });
    const brown = c.createBuffer(2, sr * 6, sr); // a different brown-noise stream per ear = wide wind
    for (let ch = 0; ch < 2; ch++) { let last = 0; brown.getChannelData(ch).forEach((_, i, d) => { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }); }
    const wind = Object.assign(c.createBufferSource(), { buffer: brown, loop: true });
    windLP = Object.assign(c.createBiquadFilter(), { type: "lowpass" as const }); windLP.frequency.value = 400;
    windGain = c.createGain(); windGain.gain.value = 0.2;
    wind.connect(windLP).connect(windGain).connect(master); wind.start();
    const roll = Object.assign(c.createBufferSource(), { buffer: noiseBuf, loop: true });
    const rollLP = Object.assign(c.createBiquadFilter(), { type: "lowpass" as const }); rollLP.frequency.value = 260; rollLP.Q.value = 0;
    rollGain = c.createGain(); rollGain.gain.value = 0;
    roll.connect(rollLP).connect(rollGain).connect(master); roll.start();
    birds();
  }
  function out(c: AudioContext, pan: number) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(master); return p; }
  function burst(c: AudioContext, t: number, dur: number, freq: number, q: number, vol: number, pan = 0) { // filtered noise hit
    const s = Object.assign(c.createBufferSource(), { buffer: noiseBuf });
    const bp = Object.assign(c.createBiquadFilter(), { type: "bandpass" as const }); bp.frequency.value = freq; bp.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(bp).connect(g).connect(out(c, pan)); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function tone(c: AudioContext, t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = "sine", pan = 0) { // swept, enveloped oscillator
    const o = Object.assign(c.createOscillator(), { type });
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out(c, pan)); o.start(t); o.stop(t + dur + 0.02);
  }
  function birds() { // a short phrase from somewhere left or right every few seconds
    birdTimer = setTimeout(() => {
      if (on && ctx) {
        const base = rnd(2400, 4200), pan = rnd(-0.8, 0.8), n = 2 + (Math.random() * 5 | 0);
        let t = ctx.currentTime;
        for (let i = 0; i < n; i++) { const f = base * rnd(0.85, 1.25); tone(ctx, t, f, f * rnd(0.65, 1.4), rnd(0.05, 0.12), 0.035, "sine", pan); t += rnd(0.08, 0.2); }
      }
      birds();
    }, rnd(2500, 8000));
  }
  const live = () => (on ? ctx : undefined);
  return {
    toggle(value: boolean) {
      if (!ctx) { ctx = new AudioContext(); init(ctx); }
      on = value; void ctx.resume();
      master.gain.setTargetAtTime(value ? 0.9 : 0, ctx.currentTime, 0.25);
    },
    update(windMph: number, speed: number) { // called every frame
      if (!ctx || !rollGain) return; // not started: never let sound break the animation
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(0.12 + windMph * 0.03, t, 0.6);
      windLP.frequency.setTargetAtTime(220 + windMph * 60, t, 0.6);
      rollGain.gain.setTargetAtTime(Math.min(speed, 2.5) * 0.22, t, 0.05);
    },
    putt(power = 1) { // club face on ball: a bright click over a hollow body
      const c = live(); if (!c) return; const t = c.currentTime + 0.01;
      burst(c, t, 0.045, 2100, 1.4, 0.55 * power); tone(c, t, 1150, 680, 0.08, 0.22 * power, "triangle");
    },
    cup() { // ball rattling against the plastic liner, then settling
      const c = live(); if (!c) return; const t = c.currentTime + 0.02;
      [0, 0.075, 0.13, 0.17, 0.2].forEach((d, i) => burst(c, t + d, 0.035, 3000 - i * 220, 5, 0.32 - i * 0.05));
      tone(c, t + 0.21, 230, 150, 0.28, 0.25);
    },
    tick() { const c = live(); if (c) tone(c, c.currentTime, 2600, 2100, 0.035, 0.04, "sine"); },
    close() { clearTimeout(birdTimer); void ctx?.close(); },
  };
}
