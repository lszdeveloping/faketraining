// 3D engine: scene, camera, renderer, raycaster, FPS-style yaw/pitch controller.

import * as THREE from "three";
import { deltaToDegrees } from "./sensitivity.js";

const DEG2RAD = Math.PI / 180;
const PITCH_LIMIT = 89.5 * DEG2RAD;
const FLOOR_Y = 0.05;

const BG_THEMES = {
  light: {
    clear: 0x586377,
    fog: 0x586377,
    room: 0x6f7888,
    wall: 0x7f8899,
    gridMajor: 0x596272,
    gridMinor: 0x505969,
  },
  dark: {
    clear: 0x1a1f2b,
    fog: 0x1a1f2b,
    room: 0x262d3c,
    wall: 0x31394b,
    gridMajor: 0x2d3650,
    gridMinor: 0x21283a,
  },
  black: {
    clear: 0x030303,
    fog: 0x030303,
    room: 0x0f1013,
    wall: 0x171a1e,
    gridMajor: 0x1f252c,
    gridMinor: 0x13181e,
  },
};

export class Engine {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.renderer = null;
    this._perf = {
      antialias: false,
      pixelRatioCap: 1,
    };
    this.softwareRenderer = false;

    this.scene = new THREE.Scene();
    // Light fog keeps depth cues with low cost.
    this.scene.fog = new THREE.Fog(0x1a1f2b, 40, 110);

    this.camera = new THREE.PerspectiveCamera(103, 1, 0.05, 500);
    this.camera.position.set(0, 1.6, 0);

    // Camera rig (yaw / pitch separate so euler order doesn't matter for input math)
    this.yaw = 0;
    this.pitch = 0;
    this.frontWall = {
      width: 40,
      height: 18,
      centerY: 4,
      z: -20,
    };

    this._buildEnvironment();

    this.raycaster = new THREE.Raycaster();
    this._screenCenter = new THREE.Vector2(0, 0);

    this.targets = new THREE.Group();
    this.scene.add(this.targets);

    this.hitFx = []; // {mesh, life, ttl}

    this.applyPerformance(settings);
    this.applyVisualTheme(settings);

    this._resize = this._resize.bind(this);
    window.addEventListener("resize", this._resize);
    this._resize();
  }

  _createRenderer() {
    if (this.renderer) this.renderer.dispose();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !!this._perf.antialias,
      powerPreference: "high-performance",
      precision: "mediump",
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.info.autoReset = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._perf.pixelRatioCap));
    this._detectSoftwareRenderer();
  }

  _detectSoftwareRenderer() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return;
      const rendererName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
      const vendorName = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || "");
      const combined = (rendererName + " " + vendorName).toLowerCase();
      const isSoftware = /swiftshader|llvmpipe|software|microsoft basic render|google.*swiftshader/.test(combined);
      this.softwareRenderer = isSoftware;
      if (isSoftware) {
        console.warn(
          "[AimForge] WebGL is running on a SOFTWARE renderer (" + rendererName +
          "). Enable 'Use hardware acceleration when available' in your browser settings for high FPS."
        );
        this._showSoftwareWarning(rendererName);
      }
    } catch {}
  }

  _showSoftwareWarning(rendererName) {
    if (typeof document === "undefined") return;
    if (document.getElementById("software-renderer-warn")) return;
    const div = document.createElement("div");
    div.id = "software-renderer-warn";
    div.style.cssText =
      "position:fixed;top:8px;left:50%;transform:translateX(-50%);" +
      "background:#ff3344;color:#fff;font:600 12px/1.3 system-ui,sans-serif;" +
      "padding:8px 14px;border-radius:6px;z-index:9999;max-width:560px;text-align:center;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer;";
    div.textContent =
      "FPS baixo: aceleração de hardware desabilitada no navegador (" + rendererName +
      "). Ative em Configurações → Sistema → 'Usar aceleração de hardware'. Clique para fechar.";
    div.addEventListener("click", () => div.remove());
    document.body.appendChild(div);
  }

  applyPerformance(settings = {}) {
    const cap = Number(settings.pixelRatioCap);
    if (Number.isFinite(cap)) {
      this._perf.pixelRatioCap = THREE.MathUtils.clamp(cap, 0.6, 2);
    }
    if (typeof settings.antialias === "boolean") {
      this._perf.antialias = settings.antialias;
    }
    this._createRenderer();
    if (this.camera) this._resize();
  }

  applyVisualTheme(settings = {}) {
    const themeName = BG_THEMES[settings.bgTheme] ? settings.bgTheme : "dark";
    const theme = BG_THEMES[themeName];

    this.renderer.setClearColor(theme.clear);
    this.scene.fog.color.setHex(theme.fog);

    if (this.room?.material) this.room.material.color.setHex(theme.room);
    if (this.wall?.material) this.wall.material.color.setHex(theme.wall);

    if (this.grid?.material) {
      const mats = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
      if (mats[0]) mats[0].color.setHex(theme.gridMajor);
      if (mats[1]) mats[1].color.setHex(theme.gridMinor);
    }
  }

  _buildEnvironment() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    // Room: a large box you stand inside.
    const roomSize = 80;
    const roomGeo = new THREE.BoxGeometry(roomSize, 30, roomSize);
    const roomMat = new THREE.MeshLambertMaterial({
      color: 0x262d3c,
      side: THREE.BackSide,
    });
    const room = new THREE.Mesh(roomGeo, roomMat);
    room.position.y = 13;
    this.scene.add(room);
    this.room = room;

    // Floor grid for spatial reference (lower divisions = fewer line draws).
    const grid = new THREE.GridHelper(roomSize, 20, 0x2d3650, 0x21283a);
    grid.position.y = 0.01;
    this.scene.add(grid);
    this.grid = grid;

    // Back wall plane to spawn targets onto (visual marker).
    const wallGeo = new THREE.PlaneGeometry(this.frontWall.width, this.frontWall.height);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x31394b });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, this.frontWall.centerY, this.frontWall.z);
    this.scene.add(wall);
    this.wall = wall;
  }

  getFrontWallDistance(radius = 0) {
    return Math.max(1, Math.abs(this.frontWall.z - this.camera.position.z) - radius);
  }

  clampToFrontWall(position, radius = 0) {
    const halfW = this.frontWall.width / 2;
    const halfH = this.frontWall.height / 2;
    const margin = radius + 0.05;
    const minY = Math.max(FLOOR_Y + margin, this.frontWall.centerY - halfH + margin);
    const maxY = this.frontWall.centerY + halfH - margin;

    position.x = THREE.MathUtils.clamp(position.x, -halfW + margin, halfW - margin);
    position.y = THREE.MathUtils.clamp(position.y, minY, maxY);
    position.z = Math.max(position.z, this.frontWall.z + margin);
    return position;
  }

  /**
   * Circular play area on the front wall, centered on the wall center,
   * with a radius derived from the desired FOV cone (rangeDeg).
   * Used by tracking mode for initial spawn + bounce containment.
   */
  getCircularWallBounds(rangeDeg, radius = 0) {
    const center = this.getWallCenterAngles();
    const centerPos = this.pointOnFrontWallFromAngles(center.yaw, center.pitch, 0);
    const distToWall = Math.abs(this.frontWall.z - this.camera.position.z);
    const worldRadius = Math.tan(rangeDeg * Math.PI / 180) * distToWall - radius;
    const halfH = this.frontWall.height / 2;
    const margin = radius + 0.05;
    const minY = Math.max(FLOOR_Y + margin, this.frontWall.centerY - halfH + margin);
    const maxY = this.frontWall.centerY + halfH - margin;
    return {
      centerX: centerPos.x,
      centerY: centerPos.y,
      z: centerPos.z,
      radius: Math.max(0.5, worldRadius),
      minY,
      maxY,
    };
  }

  getFrontWallBounds(radius = 0) {
    const halfW = this.frontWall.width / 2;
    const halfH = this.frontWall.height / 2;
    const margin = radius + 0.05;
    return {
      minX: -halfW + margin,
      maxX: halfW - margin,
      minY: Math.max(FLOOR_Y + margin, this.frontWall.centerY - halfH + margin),
      maxY: this.frontWall.centerY + halfH - margin,
      z: this.frontWall.z + margin,
    };
  }

  /**
   * Yaw/pitch from camera position toward the front wall's center point.
   * Used by spawn modes so the circular spawn FOV is anchored on the wall,
   * not on wherever the player happens to be looking.
   */
  getWallCenterAngles() {
    const camPos = this.camera.position;
    const dx = 0 - camPos.x;
    const dy = this.frontWall.centerY - camPos.y;
    const dz = this.frontWall.z - camPos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    return {
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(dy, horizDist),
    };
  }

  pointOnFrontWallFromAngles(yaw, pitch, radius = 0) {
    const margin = radius + 0.05;
    const targetZ = this.frontWall.z + margin;
    const camPos = this.camera.position;
    const cosP = Math.cos(pitch);
    const fx = -Math.sin(yaw) * cosP;
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * cosP;

    if (fz >= -0.02) {
      return this.clampToFrontWall(new THREE.Vector3(0, camPos.y, targetZ), radius);
    }

    const t = (targetZ - camPos.z) / fz;
    return this.clampToFrontWall(new THREE.Vector3(
      camPos.x + fx * t,
      camPos.y + fy * t,
      targetZ
    ), radius);
  }

  setFov(fovDeg) {
    this.camera.fov = fovDeg;
    this.camera.updateProjectionMatrix();
  }

  applyMouseDelta(dx, dy, sens, game, invertY = false) {
    const yawDeg = deltaToDegrees(dx, sens, game);
    const pitchDeg = deltaToDegrees(dy, sens, game) * (invertY ? -1 : 1);

    this.yaw -= yawDeg * DEG2RAD;
    this.pitch -= pitchDeg * DEG2RAD;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;

    // Apply as Euler YXZ to avoid roll.
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  resetCamera() {
    this.yaw = 0;
    this.pitch = 0;
    this.camera.rotation.set(0, 0, 0, "YXZ");
    this.camera.position.set(0, 1.6, 0);
  }

  /**
   * Cast a ray from the screen center forward.
   * Returns the first intersected target (Object3D in this.targets) or null.
   */
  pickAtCenter() {
    this.raycaster.setFromCamera(this._screenCenter, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets.children, false);
    return hits.length ? hits[0] : null;
  }

  /**
   * Cast a ray from camera forward; useful for tracking detection.
   */
  isAimingAt(obj) {
    this.raycaster.setFromCamera(this._screenCenter, this.camera);
    const hits = this.raycaster.intersectObject(obj, false);
    return hits.length > 0;
  }

  spawnHitFx(position, color = 0x00ff88) {
    const geo = new THREE.RingGeometry(0.1, 0.18, 24);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.lookAt(this.camera.position);
    this.scene.add(mesh);
    this.hitFx.push({ mesh, life: 0, ttl: 0.35 });
  }

  _updateFx(dt) {
    for (let i = this.hitFx.length - 1; i >= 0; i--) {
      const fx = this.hitFx[i];
      fx.life += dt;
      const t = fx.life / fx.ttl;
      fx.mesh.scale.setScalar(1 + t * 3);
      fx.mesh.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) {
        this.scene.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        fx.mesh.material.dispose();
        this.hitFx.splice(i, 1);
      }
    }
  }

  clearTargets() {
    for (let i = this.targets.children.length - 1; i >= 0; i--) {
      const t = this.targets.children[i];
      this.targets.remove(t);
      t.geometry?.dispose();
      t.material?.dispose();
    }
  }

  render(dt) {
    this._updateFx(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._perf.pixelRatioCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  resize() { this._resize(); }

  destroy() {
    window.removeEventListener("resize", this._resize);
    this.clearTargets();
    this.renderer.dispose();
  }
}
