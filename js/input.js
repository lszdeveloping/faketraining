// Input / Pointer Lock manager.
// Emits raw mouse deltas and click events while pointer is locked.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.locked = false;
    this.unadjustedMovement = false;
    this.unadjustedSupported = null; // null = unknown, true/false after first attempt
    this.listeners = {
      mousemove: [],
      mousedown: [],
      lockchange: [],
      unadjustedstatus: [],
    };
    this._smoothing = false;
    this._smoothFactor = 0.5;
    this._smoothX = 0;
    this._smoothY = 0;

    this._onMove = this._onMove.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onLockChange = this._onLockChange.bind(this);

    document.addEventListener("pointerlockchange", this._onLockChange);
    document.addEventListener("mousemove", this._onMove);
    document.addEventListener("mousedown", this._onDown);
  }

  setSmoothing(on, factor = 0.5) {
    this._smoothing = on;
    this._smoothFactor = factor;
    this._smoothX = 0;
    this._smoothY = 0;
  }

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  off(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
  }

  _emit(event, payload) {
    const arr = this.listeners[event];
    if (!arr) return;
    for (const fn of arr) fn(payload);
  }

  requestLock() {
    if (!this.canvas.requestPointerLock) return;
    // unadjustedMovement: true bypasses OS mouse acceleration / Windows pointer
    // speed so movementX/Y are raw mouse counts, matching native game sensitivity.
    let p;
    try {
      p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      this._fallbackLock();
      return;
    }
    if (p && typeof p.then === "function") {
      p.then(() => {
        this.unadjustedMovement = true;
        this.unadjustedSupported = true;
        this._emit("unadjustedstatus", { granted: true });
      }).catch(() => {
        this.unadjustedSupported = false;
        this._fallbackLock();
      });
    } else {
      // Older browsers: no promise returned. Can't confirm; assume not granted.
      this.unadjustedSupported = false;
      this.unadjustedMovement = false;
      this._emit("unadjustedstatus", { granted: false });
    }
  }

  _fallbackLock() {
    this.unadjustedMovement = false;
    try {
      this.canvas.requestPointerLock();
    } catch {}
    this._emit("unadjustedstatus", { granted: false });
  }

  exitLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    this._emit("lockchange", this.locked);
  }

  _onMove(e) {
    if (!this.locked) return;
    let dx = e.movementX || 0;
    let dy = e.movementY || 0;

    if (this._smoothing) {
      this._smoothX = this._smoothX * this._smoothFactor + dx * (1 - this._smoothFactor);
      this._smoothY = this._smoothY * this._smoothFactor + dy * (1 - this._smoothFactor);
      dx = this._smoothX;
      dy = this._smoothY;
    }

    this._emit("mousemove", { dx, dy });
  }

  _onDown(e) {
    if (!this.locked) return;
    this._emit("mousedown", { button: e.button });
  }

  destroy() {
    document.removeEventListener("pointerlockchange", this._onLockChange);
    document.removeEventListener("mousemove", this._onMove);
    document.removeEventListener("mousedown", this._onDown);
  }
}
