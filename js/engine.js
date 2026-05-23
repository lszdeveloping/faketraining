// 3D engine: scene, camera, renderer, raycaster, FPS-style yaw/pitch controller.

import * as THREE from "three";
import { deltaToDegrees } from "./sensitivity.js";

const DEG2RAD = Math.PI / 180;
const PITCH_LIMIT = 89.5 * DEG2RAD;

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
      pixelRatioCap: 1.25,
    };

    this.scene = new THREE.Scene();
    // Light fog keeps depth cues with low cost.
    this.scene.fog = new THREE.Fog(0x1a1f2b, 40, 110);

    this.camera = new THREE.PerspectiveCamera(103, 1, 0.05, 500);
    this.camera.position.set(0, 1.6, 0);

    // Camera rig (yaw / pitch separate so euler order doesn't matter for input math)
    this.yaw = 0;
    this.pitch = 0;

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
      stencil: false,
      depth: true,
      alpha: false,
    });
    this.renderer.info.autoReset = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._perf.pixelRatioCap));
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
    const roomMat = new THREE.MeshStandardMaterial({
      color: 0x262d3c,
      side: THREE.BackSide,
      roughness: 0.95,
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
    const wallGeo = new THREE.PlaneGeometry(40, 18);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x31394b, roughness: 1 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 4, -20);
    this.scene.add(wall);
    this.wall = wall;
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