/**
 * achievements.js — Exploration tracking & achievement toasts
 * Phase 3.4 of the Isekai Town implementation (also closes the
 * "Stats tracking" item from §1.2).
 *
 * Persists to localStorage under one key:
 *   { distanceDriven, timePlayed, visited: [label], zones: [key],
 *     projectsOpened: [id], unlocked: [achievementId], fastTravels }
 *
 * The class is deliberately DOM-only (no Three.js import) so it can be
 * unit-tested and so it fits the planned TownGame singleton as a plain
 * subsystem: `achievements.update(delta, cart, zoneKey, isNight)` once per tick.
 */

const STORAGE_KEY = 'settlement.explorer.v1';
const SAVE_INTERVAL = 5;          // seconds between throttled saves
const TOAST_DURATION = 4200;      // ms a toast stays on screen

// Milestone definitions. `check(stats, ctx)` returns true when earned.
const ACHIEVEMENTS = [
  { id: 'first-steps',   icon: '🛞', title: 'First Steps',        desc: 'Drove the cart 50 paces.',
    check: s => s.distanceDriven >= 50 },
  { id: 'wanderer',      icon: '🗺️', title: 'Wanderer',           desc: 'Drove 500 paces across the settlement.',
    check: s => s.distanceDriven >= 500 },
  { id: 'road-warrior',  icon: '🐎', title: 'Road Warrior',       desc: 'Drove 2,000 paces. The wheels are worn.',
    check: s => s.distanceDriven >= 2000 },
  { id: 'first-visit',   icon: '🏠', title: 'Curious Traveller',  desc: 'Approached your first building.',
    check: s => s.visited.length >= 1 },
  { id: 'half-explored', icon: '🧭', title: 'Half the Map',       desc: 'Visited half of the settlement.',
    check: (s, c) => s.visited.length >= Math.ceil(c.totalBuildings / 2) },
  { id: 'cartographer',  icon: '📜', title: 'Cartographer',       desc: 'Visited every building in town.',
    check: (s, c) => c.totalBuildings > 0 && s.visited.length >= c.totalBuildings },
  { id: 'four-corners',  icon: '🏘️', title: 'Four Corners',       desc: 'Set foot in all four quarters.',
    check: (s, c) => c.totalZones > 0 && s.zones.length >= c.totalZones },
  { id: 'scholar',       icon: '📖', title: 'Guild Scholar',      desc: 'Read three project scrolls.',
    check: s => s.projectsOpened.length >= 3 },
  { id: 'archivist',     icon: '🏛️', title: 'Archivist',          desc: 'Read every project scroll.',
    check: (s, c) => c.totalProjects > 0 && s.projectsOpened.length >= c.totalProjects },
  { id: 'night-owl',     icon: '🦉', title: 'Night Owl',          desc: 'Wandered the town after dark.',
    check: (s, c) => c.isNight && c.sessionTime > 8 },
  { id: 'settler',       icon: '⏳', title: 'Settler',            desc: 'Spent five minutes in the settlement.',
    check: s => s.timePlayed >= 300 },
  { id: 'teleporter',    icon: '✨', title: 'Blink Step',         desc: 'Used fast travel for the first time.',
    check: s => s.fastTravels >= 1 },
];

function defaultStats() {
  return {
    distanceDriven: 0,
    timePlayed: 0,
    visited: [],
    zones: [],
    projectsOpened: [],
    unlocked: [],
    fastTravels: 0,
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultStats(), parsed);
  } catch (_) {
    return defaultStats();
  }
}

export class Achievements {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container   where toasts + HUD are mounted (#town-world)
   * @param {Array}  opts.buildings        [{ label, zone, project }]
   * @param {Array}  opts.zones            zone keys
   * @param {boolean} opts.reducedMotion
   * @param {Function} [opts.onUnlock]     called with the achievement on unlock (e.g. play chime)
   */
  constructor(opts) {
    this.buildings = opts.buildings || [];
    this.totalBuildings = this.buildings.length;
    this.totalProjects  = this.buildings.filter(b => b.project).length;
    this.totalZones     = (opts.zones || []).length;
    this.reducedMotion  = !!opts.reducedMotion;
    this.onUnlock       = opts.onUnlock || null;

    this.stats = loadStats();
    this.sessionTime = 0;
    this._saveTimer = 0;
    this._dirty = false;
    this._lastPos = null;
    this._checkTimer = 0;
    this._queue = [];
    this._showing = false;

    this._buildDom(opts.container || document.body);
    this._renderHud();

    // Persist on tab hide / unload (mobile Safari fires pagehide, not unload)
    const flush = () => this.save(true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  // ── DOM ──────────────────────────────────────────────────────
  _buildDom(container) {
    this.toastRoot = document.createElement('div');
    this.toastRoot.id = 'achievement-toasts';
    this.toastRoot.className = 'achievement-toasts';
    // Screen readers announce unlocks without needing the canvas
    this.toastRoot.setAttribute('role', 'status');
    this.toastRoot.setAttribute('aria-live', 'polite');
    container.appendChild(this.toastRoot);

    this.hud = document.createElement('button');
    this.hud.id = 'explore-hud';
    this.hud.className = 'explore-hud';
    this.hud.type = 'button';
    this.hud.setAttribute('aria-label', 'Exploration progress');
    this.hud.innerHTML = `
      <span class="explore-hud-icon" aria-hidden="true">🧭</span>
      <span class="explore-hud-pct">0%</span>
      <span class="explore-hud-bar" aria-hidden="true"><span class="explore-hud-fill"></span></span>`;
    container.appendChild(this.hud);
    this.hudPct  = this.hud.querySelector('.explore-hud-pct');
    this.hudFill = this.hud.querySelector('.explore-hud-fill');

    // Clicking / activating the HUD shows a summary toast
    this.hud.addEventListener('click', () => this.showSummary());
  }

  _renderHud() {
    const pct = this.explorationPercent();
    this.hudPct.textContent = `${pct}%`;
    this.hudFill.style.width = `${pct}%`;
    this.hud.title = `Explored ${this.stats.visited.length}/${this.totalBuildings} buildings · ` +
      `${this.stats.unlocked.length}/${ACHIEVEMENTS.length} achievements`;
  }

  // ── Public API ───────────────────────────────────────────────
  explorationPercent() {
    if (!this.totalBuildings) return 0;
    return Math.round((this.stats.visited.length / this.totalBuildings) * 100);
  }

  /** Mark a building as approached. Cheap to call every frame. */
  visit(label) {
    if (this.stats.visited.includes(label)) return;
    this.stats.visited.push(label);
    this._dirty = true;
    this._renderHud();
    this.toast({ icon: '📍', title: label, desc: `Discovered · ${this.explorationPercent()}% explored`, minor: true });
    this._checkAchievements();
  }

  onProjectOpened(projectId) {
    if (!projectId || this.stats.projectsOpened.includes(projectId)) return;
    this.stats.projectsOpened.push(projectId);
    this._dirty = true;
    this._checkAchievements();
  }

  onFastTravel() {
    this.stats.fastTravels++;
    this._dirty = true;
    this._checkAchievements();
  }

  /**
   * Per-frame update.
   * @param {number} delta   seconds
   * @param {Cart}   cart    needs getPosition() and .teleporting
   * @param {string} zoneKey current zone key
   * @param {boolean} isNight
   */
  update(delta, cart, zoneKey, isNight) {
    this.sessionTime += delta;
    this.stats.timePlayed += delta;

    const p = cart.getPosition();
    if (this._lastPos && !cart.teleporting) {
      const d = Math.hypot(p.x - this._lastPos.x, p.z - this._lastPos.z);
      // Ignore micro-jitter and teleport jumps that slipped through
      if (d > 0.0005 && d < 5) this.stats.distanceDriven += d;
    }
    this._lastPos = p;

    if (zoneKey && !this.stats.zones.includes(zoneKey)) {
      this.stats.zones.push(zoneKey);
      this._dirty = true;
    }

    this._isNight = !!isNight;

    // Achievement checks are cheap but there's no need to run them at 60Hz
    this._checkTimer += delta;
    if (this._checkTimer > 0.5) {
      this._checkTimer = 0;
      this._checkAchievements();
    }

    this._saveTimer += delta;
    if (this._saveTimer > SAVE_INTERVAL) {
      this._saveTimer = 0;
      this.save();
    }
  }

  save(force = false) {
    // Distance/time change every frame, so always write on the throttle
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
      this._dirty = false;
    } catch (_) { /* private mode / quota — stats stay in memory */ }
  }

  reset() {
    this.stats = defaultStats();
    this.save(true);
    this._renderHud();
  }

  showSummary() {
    const s = this.stats;
    const mins = Math.floor(s.timePlayed / 60);
    this.toast({
      icon: '🧭',
      title: `${this.explorationPercent()}% explored`,
      desc: `${s.visited.length}/${this.totalBuildings} buildings · ${Math.round(s.distanceDriven)} paces · ` +
            `${mins}m played · ${s.unlocked.length}/${ACHIEVEMENTS.length} achievements`,
      minor: true,
    });
  }

  // ── Internals ────────────────────────────────────────────────
  _checkAchievements() {
    const ctx = {
      totalBuildings: this.totalBuildings,
      totalProjects: this.totalProjects,
      totalZones: this.totalZones,
      isNight: this._isNight,
      sessionTime: this.sessionTime,
    };
    for (const a of ACHIEVEMENTS) {
      if (this.stats.unlocked.includes(a.id)) continue;
      let earned = false;
      try { earned = a.check(this.stats, ctx); } catch (_) { earned = false; }
      if (!earned) continue;
      this.stats.unlocked.push(a.id);
      this._dirty = true;
      this._renderHud();
      this.toast({ icon: a.icon, title: a.title, desc: a.desc, achievement: true });
      if (this.onUnlock) { try { this.onUnlock(a); } catch (_) {} }
    }
  }

  /** Queue a toast; only one is visible at a time so unlocks don't pile up. */
  toast(t) {
    this._queue.push(t);
    if (!this._showing) this._next();
  }

  _next() {
    const t = this._queue.shift();
    if (!t) { this._showing = false; return; }
    this._showing = true;

    const el = document.createElement('div');
    el.className = 'achievement-toast' + (t.achievement ? ' is-achievement' : '') + (t.minor ? ' is-minor' : '');
    el.innerHTML = `
      <span class="achievement-toast-icon" aria-hidden="true"></span>
      <span class="achievement-toast-body">
        <span class="achievement-toast-kicker"></span>
        <span class="achievement-toast-title"></span>
        <span class="achievement-toast-desc"></span>
      </span>`;
    el.querySelector('.achievement-toast-icon').textContent   = t.icon || '✨';
    el.querySelector('.achievement-toast-kicker').textContent = t.achievement ? 'Achievement unlocked' : '';
    el.querySelector('.achievement-toast-title').textContent  = t.title || '';
    el.querySelector('.achievement-toast-desc').textContent   = t.desc || '';
    this.toastRoot.appendChild(el);

    // Force a layout so the enter transition plays (skipped under reduced motion)
    void el.offsetWidth;
    el.classList.add('is-visible');

    const dur = t.minor ? TOAST_DURATION * 0.6 : TOAST_DURATION;
    setTimeout(() => {
      el.classList.remove('is-visible');
      const remove = () => { el.remove(); this._next(); };
      if (this.reducedMotion) remove();
      else setTimeout(remove, 350);
    }, dur);
  }
}

export { ACHIEVEMENTS };
