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
    const size = Math.max(0.1, this.settings.trackingTargetSize || this.settings.targetSize);
    const bounds = this.engine.getFrontWallBounds(size);
    const targetColor = new THREE.Color(this.settings.targetColor || "#ffcc4d");
    const geo = new THREE.SphereGeometry(size, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: targetColor,
      emissive: targetColor.clone().multiplyScalar(0.3),
      roughness: 0.4,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(
      THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random()),
      THREE.MathUtils.lerp(bounds.minY, bounds.maxY, Math.random()),
      bounds.z
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
    const bounds = this.engine.getFrontWallBounds(radius);
    const p = this._target.position;

    if (p.x < bounds.minX || p.x > bounds.maxX) {
      p.x = THREE.MathUtils.clamp(p.x, bounds.minX, bounds.maxX);
      this._velocity.x *= -0.9;
      this._desiredVelocity.x *= -1;
    }
    if (p.y < bounds.minY || p.y > bounds.maxY) {
      p.y = THREE.MathUtils.clamp(p.y, bounds.minY, bounds.maxY);
      this._velocity.y *= -0.9;
      this._desiredVelocity.y *= -1;
    }

    p.z = bounds.z;
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
