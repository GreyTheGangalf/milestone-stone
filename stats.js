// Milestone Stone — progress counters: streak of days with progress, items
// done and milestones sealed.
// The days with progress are kept in %USERPROFILE%\.milestone-stone\activity.json,
// apart from milestones.json, because in GitHub mode that file is replaced by
// the copy in the repository. Items done and milestones sealed are counted
// from the plan itself, so they need no history.
// Has no Electron dependency, so it can be tested with `node --test`.
const fs = require('fs');
const { atomicWrite } = require('./store');

const MAX_DAYS = 400;   // enough for any streak worth showing

// Local calendar day as "YYYY-MM-DD" (a tick at 23:30 counts for that evening).
function localDay(date = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// "2026-11-26" -> "2026-11-25". Works on the date string, so it ignores
// daylight saving changes.
function previousDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
    return t.toISOString().slice(0, 10);
}

function countDone(state) {
    if (!state || !Array.isArray(state.milestones)) return 0;
    let n = 0;
    for (const m of state.milestones) for (const it of m.items || []) if (it && it.done) n++;
    return n;
}

function countSealed(state) {
    if (!state || !Array.isArray(state.milestones)) return 0;
    return state.milestones.filter(m => m && m.status === 'done').length;
}

// Days in a row with progress, ending today. A day without progress yet does
// not break the streak until it is over: if today is empty, the streak that
// ended yesterday still counts.
function currentStreak(days, today = localDay()) {
    const set = new Set(days);
    let day = set.has(today) ? today : previousDay(today);
    let n = 0;
    while (set.has(day)) { n++; day = previousDay(day); }
    return n;
}

// Returns the activity with `day` added (sorted, no duplicates, last MAX_DAYS).
function addDay(activity, day = localDay()) {
    const days = new Set(activity && Array.isArray(activity.days) ? activity.days : []);
    days.add(day);
    return { ...(activity || {}), days: [...days].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-MAX_DAYS) };
}

// Never throws: a missing or broken file starts an empty history.
function loadActivity(file, log = console.warn) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return { days: [] }; }
    try {
        const a = JSON.parse(text.replace(/^﻿/, ''));
        return { ...a, days: Array.isArray(a.days) ? a.days.filter(d => typeof d === 'string') : [] };
    } catch (e) {
        log(`[milestone-stone] ${file} ignored, starting a new streak history: ${e.message}`);
        return { days: [] };
    }
}

function saveActivity(file, activity) {
    atomicWrite(file, JSON.stringify(activity, null, 2));
}

// Progress means more items are done than before (a new tick, from the stone,
// the skill or GitHub). Unticking or sealing alone is not progress.
function madeProgress(prev, next) {
    return countDone(next) > countDone(prev);
}

function summary(state, activity, today = localDay()) {
    return {
        streak: currentStreak(activity && activity.days ? activity.days : [], today),
        done: countDone(state),
        sealed: countSealed(state)
    };
}

module.exports = { localDay, previousDay, countDone, countSealed, currentStreak, addDay, loadActivity, saveActivity, madeProgress, summary };