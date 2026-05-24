import * as THREE from "three";

// FLICK mode: spawn one target inside a CIRCULAR FOV range around the camera forward.
// Hit -> respawn. Miss -> score penalty. Score: hits*100 - misses*25 + speed bonus + streak bonus.

const DIFFICULTY = {
  easy: { rangeMul: 0.6, sizeMul: 1.2 },
  medium: { rangeMul: 1.0, sizeMul: 1.0 },
  hard: { rangeMul: 1.3, sizeMul: 0.8 },
  custom: { rangeMul: 1.0, sizeMul: 1.0 },
};

const DEG2RAD = Math.PI / 180;
const FLOOR_Y = 0.05;

export class FlickMode {
  constructor(engine, stats, settings) {
    this.engine = engine;
    this.stats = stats;
    this.settings = settings;
    this.name = "flick";
    this._target = null;
    this._spawnAt = 0;
    this._t = 0;
    this._diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.medium;
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

    const size = this.settings.targetSize * this._diff.sizeMul;
    const rangeDeg = this.settings.spawnRangeDeg * this._diff.rangeMul;

    let pos = this.engine.pointOnFrontWallFromAngles(this.engine.yaw, this.engine.pitch, size);
    // Try up to 12 times to land a spawn that isn't intersecting the floor.
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      // bias toward the edge of the ring (sqrt distribution = uniform on disk)
      const radiusFrac = Math.sqrt(Math.random());
      const offsetDeg = radiusFrac * rangeDeg;
      const offRad = offsetDeg * DEG2RAD;

      const yawOff = Math.sin(angle) * offRad;
      const pitchOff = Math.cos(angle) * offRad;

      const yaw = this.engine.yaw + yawOff;
      const pitch = THREE.MathUtils.clamp(this.engine.pitch + pitchOff, -Math.PI / 3, Math.PI / 3);

      pos = this.engine.pointOnFrontWallFromAngles(yaw, pitch, size);

      if (pos.y - size > FLOOR_Y) break;
    }
    // Final guard: lift target above floor even if the loop failed.
    if (pos.y - size <= FLOOR_Y) pos.y = FLOOR_Y + size + 0.01;
    this.engine.clampToFrontWall(pos, size);

    const targetColor = new THREE.Color(this.settings.targetColor || "#ff4d6d");
    const geo = new THREE.SphereGeometry(size, 16, 12);
    const mat = new THREE.MeshLambertMaterial({
      color: targetColor,
      emissive: targetColor.clone().multiplyScalar(0.35),
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.userData.radius = size;
    this.engine.targets.add(m);
    this._target = m;
    this._spawnAt = now;
    this.stats.markSpawn(now);
  }

  onShoot(now) {
    const hit = this.engine.pickAtCenter();
    if (hit && hit.object === this._target) {
      const reaction = now - this._spawnAt;
      const speedBonus = Math.max(0, 50 - reaction * 50);
      const streakBonus = this.stats.streak * 5;
      this.stats.registerHit(now, 100 + speedBonus + streakBonus);
      this.engine.spawnHitFx(this._target.position, 0x00ff88);
      this._spawn(now);
    } else {
      this.stats.registerMiss(-25);
    }
  }

  update(dt, now) { this._t = now; }

  destroy() {
    if (this._target) {
      this.engine.targets.remove(this._target);
      this._target.geometry.dispose();
      this._target.material.dispose();
      this._target = null;
    }
  }
}
