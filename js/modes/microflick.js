import * as THREE from "three";

// MICROFLICK: small targets spawn close to wall center.
// Trains tiny corrections. Spawn radius defined in degrees from wall center.

const DEG2RAD = Math.PI / 180;
const MICRO_MAX_DEG = 4;
const MICRO_SIZE_MUL = 0.8;
const MICRO_GAP = 0.10;

export class MicroflickMode {
  constructor(engine, stats, settings) {
    this.engine = engine;
    this.stats = stats;
    this.settings = settings;
    this.name = "microflick";
    this._target = null;
    this._spawnAt = 0;
    this._lastCorrection = 0;
    this._corrections = [];
    this._lastAngles = [];
    this._lastHorizontalSign = 0;
  }

  start() {
    this._spawn(0);
  }

  _spawn(now) {
    if (this._target) {
      this.engine.targets.remove(this._target);
      this._target.geometry.dispose();
      this._target.material.dispose();
    }
    const size = Math.max(0.12, this.settings.targetSize * MICRO_SIZE_MUL * 0.6);
    const FLOOR_Y = 0.05;

    // Spawn ring centered on wall center. Microflick caps offset to MICRO_MAX_DEG.
    const maxDeg = Math.min(MICRO_MAX_DEG, this.settings.spawnRangeDeg || MICRO_MAX_DEG);
    const center = this.engine.getWallCenterAngles();
    let offsetDeg = 0;
    let pos = this.engine.pointOnFrontWallFromAngles(center.yaw, center.pitch, size);
    let chosenAngle = 0;
    let hasChosenAngle = false;
    for (let i = 0; i < 14; i++) {
      // Spread better over the circle while discouraging repeated same-side spawns.
      const preferSign = this._lastHorizontalSign === 0
        ? (Math.random() < 0.5 ? -1 : 1)
        : (Math.random() < 0.75 ? -this._lastHorizontalSign : this._lastHorizontalSign);
      const hemiAngle = Math.random() * Math.PI;
      const angle = preferSign > 0 ? hemiAngle : (hemiAngle + Math.PI);
      if (!this._acceptAngle(angle, i >= 10)) continue;

      offsetDeg = Math.pow(Math.random(), 0.7) * maxDeg;
      const offY = Math.cos(angle) * offsetDeg * DEG2RAD;
      const offX = Math.sin(angle) * offsetDeg * DEG2RAD;

      const yaw = center.yaw + offX;
      const pitch = THREE.MathUtils.clamp(center.pitch + offY, -Math.PI / 3, Math.PI / 3);

      pos = this.engine.pointOnFrontWallFromAngles(yaw, pitch, size);
      if (pos.y - size > FLOOR_Y) {
        chosenAngle = angle;
        hasChosenAngle = true;
        break;
      }
    }
    if (pos.y - size <= FLOOR_Y) pos.y = FLOOR_Y + size + 0.01;
    this.engine.clampToFrontWall(pos, size);

    const targetColor = new THREE.Color(this.settings.targetColor || "#36d1ff");
    const geo = new THREE.SphereGeometry(size, 16, 12);
    const mat = new THREE.MeshLambertMaterial({
      color: targetColor,
      emissive: targetColor.clone().multiplyScalar(0.33),
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.userData.radius = size;
    m.userData.offsetDeg = offsetDeg;
    this.engine.targets.add(m);
    this._target = m;
    this._spawnAt = now;
    this._lastCorrection = offsetDeg;
    if (hasChosenAngle) {
      this._lastAngles.push(chosenAngle);
      if (this._lastAngles.length > 4) this._lastAngles.shift();
      this._lastHorizontalSign = Math.sin(chosenAngle) >= 0 ? 1 : -1;
    }
    this.stats.markSpawn(now);
  }

  _acceptAngle(angle, relaxed) {
    if (!this._lastAngles.length) return true;
    const minDelta = relaxed ? 0.35 : 0.7;
    for (const prev of this._lastAngles) {
      const d = Math.abs(Math.atan2(Math.sin(angle - prev), Math.cos(angle - prev)));
      if (d < minDelta) return false;
    }
    return true;
  }

  onShoot(now) {
    const hit = this.engine.pickAtCenter();
    if (hit && hit.object === this._target) {
      const reaction = now - this._spawnAt;
      const precisionBonus = Math.max(0, 60 - this._lastCorrection * 8);
      const reactionBonus = Math.max(0, 40 - reaction * 40);
      this.stats.registerHit(now, 120 + precisionBonus + reactionBonus);
      this._corrections.push(this._lastCorrection);
      this.engine.spawnHitFx(this._target.position, 0x36d1ff);
      setTimeout(() => this._spawn(performance.now() / 1000), MICRO_GAP * 1000);
      // wipe so user can't double-hit
      this.engine.targets.remove(this._target);
      this._target.geometry.dispose();
      this._target.material.dispose();
      this._target = null;
    } else {
      this.stats.registerMiss(-30);
    }
  }

  update() {}

  avgMicroCorrection() {
    if (!this._corrections.length) return 0;
    return this._corrections.reduce((a, b) => a + b, 0) / this._corrections.length;
  }

  destroy() {
    if (this._target) {
      this.engine.targets.remove(this._target);
      this._target.geometry.dispose();
      this._target.material.dispose();
      this._target = null;
    }
  }
}
