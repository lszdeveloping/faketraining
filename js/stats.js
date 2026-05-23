// Stats tracker for all modes.

export class Stats {
  constructor() {
    this.reset();
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.shots = 0;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.reactionTimes = [];   // ms
    this.trackingOnTime = 0;   // seconds
    this.trackingTotalTime = 0;
    this.samples = [];         // per-second score samples for chart
    this._lastSample = 0;
    this._spawnTime = 0;
  }

  markSpawn(t) {
    this._spawnTime = t;
  }

  registerHit(t, scoreDelta) {
    this.hits++;
    this.shots++;
    this.streak++;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    if (this._spawnTime > 0) {
      this.reactionTimes.push((t - this._spawnTime) * 1000);
    }
    this.score += scoreDelta;
  }

  registerMiss(scoreDelta) {
    this.misses++;
    this.shots++;
    this.streak = 0;
    this.score += scoreDelta;
    if (this.score < 0) this.score = 0;
  }

  registerTracking(dt, onTarget) {
    this.trackingTotalTime += dt;
    if (onTarget) this.trackingOnTime += dt;
  }

  sample(t) {
    if (t - this._lastSample >= 1) {
      this.samples.push(this.score);
      this._lastSample = t;
    }
  }

  accuracy() {
    if (this.shots === 0) return 0;
    return this.hits / this.shots;
  }

  trackingAccuracy() {
    if (this.trackingTotalTime === 0) return 0;
    return this.trackingOnTime / this.trackingTotalTime;
  }

  avgReaction() {
    if (!this.reactionTimes.length) return 0;
    return this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length;
  }
}
