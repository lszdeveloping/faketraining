import * as THREE from "three";

// TRACKING: single moving target. Player holds aim on it.
// Movement patterns: strafe, circular, mixed with accel/decel.

const DIFFICULTY = {
  easy: { speed: 2.5, sizeMul: 1.3, pattern: "strafe" },
  medium: { speed: 4.0, sizeMul: 1.0, pattern: "mixed" },
  hard: { speed: 6.0, sizeMul: 0.8, pattern: "mixed" },
  custom: { speed: 4.0, sizeMul: 1.0, pattern: "mixed" },
};

export class TrackingMode {
  constructor(engine, stats, settings) {
    this.engine = engine;
    this.stats = stats;
    this.settings = settings;
    this.name = "tracking";
    this._diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.medium;
    this._target = null;
    this._t = 0;
    this._dir = new THREE.Vector3(1, 0, 0);
    this._velocity = this._diff.speed;
    this._patternTimer = 0;
    this._pattern = this._diff.pattern;
    this._onTargetSamples = [];
  }

  start() {
    const size = this.settings.targetSize * this._diff.sizeMul;
    const dist = this.settings.targetDistance;
    const targetColor = new THREE.Color(this.settings.targetColor || "#ffcc4d");
    const geo = new THREE.SphereGeometry(size, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: targetColor,
      emissive: targetColor.clone().multiplyScalar(0.3),
      roughness: 0.4,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 1.6, -dist);
    m.userData.radius = size;
    this.engine.targets.add(m);
    this._target = m;
  }

  onShoot() {
    // Tracking scores by time-on-target, not by clicks. Clicks are ignored.
  }

  update(dt, now) {
    if (!this._target) return;
    this._t += dt;
    this._patternTimer += dt;

    const dist = this.settings.targetDistance;
    const bounds = Math.min(12, dist * 0.7);

    let mode = this._pattern;
    if (mode === "mixed") {
      const phase = Math.floor(this._t / 3) % 3;
      mode = ["strafe", "circular", "strafe"][phase];
    }

    const radius = this._target.userData.radius || 0.6;
    const minY = 0.05 + radius + 0.01; // never enter the floor

    if (mode === "strafe") {
      const x = Math.sin(this._t * this._velocity * 0.35) * bounds;
      let y = 1.6 + Math.sin(this._t * this._velocity * 0.55) * (bounds * 0.25);
      if (y < minY) y = minY;
      this._target.position.set(x, y, -dist);
    } else if (mode === "circular") {
      const r = bounds * 0.5;
      const w = this._velocity * 0.4;
      let y = 1.6 + Math.sin(this._t * w) * r * 0.6;
      if (y < minY) y = minY;
      this._target.position.set(
        Math.cos(this._t * w) * r,
        y,
        -dist + Math.sin(this._t * w * 0.5) * 1.5
      );
    } else {
      if (this._patternTimer > 0.6 + Math.random() * 0.6) {
        this._patternTimer = 0;
        this._dir.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.6, 0).normalize();
      }
      const p = this._target.position;
      p.x = THREE.MathUtils.clamp(p.x + this._dir.x * this._velocity * dt, -bounds, bounds);
      p.y = THREE.MathUtils.clamp(p.y + this._dir.y * this._velocity * dt, minY, 1.6 + bounds * 0.4);
      p.z = -dist;
    }

    const aiming = this.engine.isAimingAt(this._target);
    this.stats.registerTracking(dt, aiming);
    this._onTargetSamples.push(aiming ? 1 : 0);

    // Score growth per frame
    if (aiming) {
      this.stats.score += 10 * dt;
    } else {
      this.stats.score -= 2 * dt;
      if (this.stats.score < 0) this.stats.score = 0;
    }
  }

  /**
   * Smoothness: how often the on/off transitions happen.
   * Fewer transitions per second = smoother tracking.
   */
  smoothness() {
    let transitions = 0;
    for (let i = 1; i < this._onTargetSamples.length; i++) {
      if (this._onTargetSamples[i] !== this._onTargetSamples[i - 1]) transitions++;
    }
    const seconds = Math.max(1, this.stats.trackingTotalTime);
    const tps = transitions / seconds;
    // map to 0..100 (lower transitions/s = higher smoothness)
    return Math.max(0, 100 - tps * 10);
  }

  finalizeScore() {
    // Apply final tracking formula: timeOnTarget*10 + acc*1000 - penalty
    const acc = this.stats.trackingAccuracy();
    const lost = this.stats.trackingTotalTime - this.stats.trackingOnTime;
    const score = this.stats.trackingOnTime * 10 + acc * 1000 - lost * 4;
    this.stats.score = Math.max(0, Math.round(score));
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