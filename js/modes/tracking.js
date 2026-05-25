import * as THREE from "three";

// TRACKING: one target moves inside the front wall bounds with continuous random steering.

export class TrackingMode {
  constructor(engine, stats, settings) {
    this.engine = engine;
    this.stats = stats;
    this.settings = settings;
    this.name = "tracking";
    this._target = null;
    this._t = 0;
    this._velocity = new THREE.Vector3();
    this._desiredVelocity = new THREE.Vector3();
    this._changeTimer = 0;
    this._nextChange = 0;
    this._onTargetSamples = [];
  }

  start() {
    const size = Math.max(0.1, this.settings.targetSize);
    const rangeDeg = this.settings.spawnRangeDeg || 30;
    const cb = this.engine.getCircularWallBounds(rangeDeg, size);
    const targetColor = new THREE.Color(this.settings.targetColor || "#ffcc4d");
    const geo = new THREE.SphereGeometry(size, 16, 12);
    const mat = new THREE.MeshLambertMaterial({
      color: targetColor,
      emissive: targetColor.clone().multiplyScalar(0.3),
    });
    const m = new THREE.Mesh(geo, mat);
    // Spawn at random point inside circle (uniform on disk via sqrt distribution).
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * cb.radius;
    const initY = THREE.MathUtils.clamp(cb.centerY + Math.sin(angle) * r, cb.minY, cb.maxY);
    m.position.set(
      cb.centerX + Math.cos(angle) * r,
      initY,
      cb.z
    );
    m.userData.radius = size;
    this.engine.targets.add(m);
    this._target = m;
    this._pickNewVelocity(true);
  }

  onShoot() {
    // Tracking scores by time-on-target, not by clicks. Clicks are ignored.
  }

  update(dt) {
    if (!this._target) return;
    this._t += dt;
    this._changeTimer += dt;

    if (this._changeTimer >= this._nextChange) {
      this._pickNewVelocity(false);
    }

    const randomness = this._randomness();
    const steer = THREE.MathUtils.lerp(2.8, 8.5, randomness);
    this._velocity.lerp(this._desiredVelocity, Math.min(1, dt * steer));

    const p = this._target.position;
    p.addScaledVector(this._velocity, dt);
    this._applyNoise(p, dt, randomness);
    this._bounceInsideWall();

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

  _randomness() {
    return THREE.MathUtils.clamp((this.settings.trackingRandomness ?? 70) / 100, 0, 1);
  }

  _speed() {
    return Math.max(0.2, this.settings.trackingSpeed || 4.5);
  }

  _pickNewVelocity(initial) {
    const randomness = this._randomness();
    const angle = Math.random() * Math.PI * 2;
    const speedJitter = THREE.MathUtils.lerp(0.75, 1.35, Math.random());
    const yBias = THREE.MathUtils.lerp(0.55, 1.0, randomness);
    const speed = this._speed() * speedJitter;

    this._desiredVelocity.set(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed * yBias,
      0
    );

    if (initial) this._velocity.copy(this._desiredVelocity);
    this._changeTimer = 0;
    this._nextChange = THREE.MathUtils.lerp(1.1, 0.22, randomness) + Math.random() * 0.35;
  }

  _applyNoise(position, dt, randomness) {
    if (randomness <= 0) return;
    const speed = this._speed();
    const wobble = Math.sin(this._t * (5.2 + randomness * 6.5)) * speed * randomness * 0.18;
    const drift = Math.cos(this._t * (3.7 + randomness * 5.0)) * speed * randomness * 0.12;
    position.x += wobble * dt;
    position.y += drift * dt;
  }

  _bounceInsideWall() {
    const radius = this._target.userData.radius || 0.6;
    const rangeDeg = this.settings.spawnRangeDeg || 30;
    const cb = this.engine.getCircularWallBounds(rangeDeg, radius);
    const p = this._target.position;

    // Circular bounce around wall-center spawn area.
    const dx = p.x - cb.centerX;
    const dy = p.y - cb.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > cb.radius) {
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      p.x = cb.centerX + nx * cb.radius;
      p.y = cb.centerY + ny * cb.radius;
      const vDotN = this._velocity.x * nx + this._velocity.y * ny;
      if (vDotN > 0) {
        this._velocity.x -= 2 * vDotN * nx * 0.9;
        this._velocity.y -= 2 * vDotN * ny * 0.9;
      }
      const dvDotN = this._desiredVelocity.x * nx + this._desiredVelocity.y * ny;
      if (dvDotN > 0) {
        this._desiredVelocity.x -= 2 * dvDotN * nx;
        this._desiredVelocity.y -= 2 * dvDotN * ny;
      }
    }

    // Floor / wall-vertical guard (circle can extend below floor when rangeDeg is large).
    if (p.y < cb.minY) {
      p.y = cb.minY;
      if (this._velocity.y < 0) this._velocity.y *= -0.9;
      if (this._desiredVelocity.y < 0) this._desiredVelocity.y *= -1;
    }
    if (p.y > cb.maxY) {
      p.y = cb.maxY;
      if (this._velocity.y > 0) this._velocity.y *= -0.9;
      if (this._desiredVelocity.y > 0) this._desiredVelocity.y *= -1;
    }

    p.z = cb.z;
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
