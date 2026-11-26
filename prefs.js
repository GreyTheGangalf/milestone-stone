// Milestone Stone — preferences of the widget on this computer
// (size, position, always on top, notifications, sound).
// Kept in %USERPROFILE%\.milestone-stone\prefs.json, separate from
// milestones.json: in GitHub mode milestones.json is replaced by the copy in
// the repository, and window settings should not travel with the plan.
// Has no Electron dependency, so it can be tested with `node --test`.
const fs = require('fs');
const { atomicWrite } = require('./store');

// Size presets shown in the tray menu. 1 is the original size.
const SIZES = { small: 0.75, medium: 1, large: 1.3 };
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const SCALE_STEP = 0.05;   // one Ctrl + mouse wheel notch

const DEFAULTS = {
    scale: SIZES.medium,
    alwaysOnTop: false,     // the stone stays on the desktop and goes behind windows
    notifications: true,    // notify when a milestone is completed from outside
    sound: true,            // short sound when a stone is sealed
    position: null          // null: bottom right corner. Otherwise distance of the
                            // window's right and bottom edges from the right and
                            // bottom edges of the primary screen's work area.
};
// Since v0.5 the stone always shows when the app starts, so "hidden" is no
// longer saved. An old prefs.json that still has it is read without error.

// Keeps a scale inside the allowed range and rounds it to whole percents.
function clampScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS.scale;
    return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 100) / 100;
}

// Returns the preset name for a scale ('small', 'medium', 'large') or null.
function sizeName(scale) {
    for (const [name, value] of Object.entries(SIZES)) if (Math.abs(value - scale) < 0.001) return name;
    return null;
}

function normalizePosition(pos) {
    if (!pos || typeof pos !== 'object') return null;
    const right = Number(pos.right), bottom = Number(pos.bottom);
    if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null;
    return { right: Math.round(right), bottom: Math.round(bottom) };
}

// Fills in defaults and drops values of the wrong type. Unknown keys are kept.
function normalizePrefs(raw) {
    const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    p.scale = p.scale === undefined ? DEFAULTS.scale : clampScale(p.scale);
    for (const key of ['alwaysOnTop', 'notifications', 'sound']) {
        if (typeof p[key] !== 'boolean') p[key] = DEFAULTS[key];
    }
    p.position = normalizePosition(p.position);
    delete p.hidden;
    return p;
}

// Never throws: a missing or broken prefs file gives the defaults.
function loadPrefs(file, log = console.warn) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return normalizePrefs(null); }
    try { return normalizePrefs(JSON.parse(text.replace(/^﻿/, ''))); }
    catch (e) {
        log(`[milestone-stone] ${file} ignored, using default preferences: ${e.message}`);
        return normalizePrefs(null);
    }
}

function savePrefs(file, prefs) {
    atomicWrite(file, JSON.stringify(normalizePrefs(prefs), null, 2));
}

module.exports = { SIZES, MIN_SCALE, MAX_SCALE, SCALE_STEP, DEFAULTS, clampScale, sizeName, normalizePosition, normalizePrefs, loadPrefs, savePrefs };