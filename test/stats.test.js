// Run with node --test: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { localDay, previousDay, countDone, countSealed, currentStreak, addDay, loadActivity, saveActivity, madeProgress, summary } = require('../stats');

function plan(doneFlags, sealed = 0) {
    const milestones = [];
    for (let i = 0; i < sealed; i++) milestones.push({ id: `S${i}`, status: 'done', items: [{ text: 's', done: true }] });
    milestones.push({ id: 'M', status: 'active', items: doneFlags.map((done, i) => ({ text: `i${i}`, done })) });
    return { current: sealed, milestones };
}

test('local day uses the local calendar', () => {
    assert.strictEqual(localDay(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('previous day crosses months and years', () => {
    assert.strictEqual(previousDay('2026-03-01'), '2026-02-28');
    assert.strictEqual(previousDay('2026-01-01'), '2025-12-31');
});

test('streak counts days in a row ending today', () => {
    assert.strictEqual(currentStreak(['2026-11-24', '2026-11-25', '2026-11-26'], '2026-11-26'), 3);
});

test('an empty today does not break the streak yet', () => {
    assert.strictEqual(currentStreak(['2026-11-24', '2026-11-25'], '2026-11-26'), 2);
});

test('a missed day ends the streak', () => {
    assert.strictEqual(currentStreak(['2026-11-22', '2026-11-23'], '2026-11-26'), 0);
    assert.strictEqual(currentStreak(['2026-11-22', '2026-11-24', '2026-11-25', '2026-11-26'], '2026-11-26'), 3);
});

test('addDay keeps days unique and sorted', () => {
    let a = addDay({ days: [] }, '2026-11-26');
    a = addDay(a, '2026-11-25');
    a = addDay(a, '2026-11-26');
    assert.deepStrictEqual(a.days, ['2026-11-25', '2026-11-26']);
});

test('done and sealed counts come from the plan', () => {
    const s = plan([true, false, true], 2);
    assert.strictEqual(countDone(s), 4);
    assert.strictEqual(countSealed(s), 2);
    assert.deepStrictEqual(summary(s, { days: ['2026-11-26'] }, '2026-11-26'), { streak: 1, done: 4, sealed: 2 });
});

test('only a new tick is progress', () => {
    assert.ok(madeProgress(plan([false, false]), plan([true, false])));
    assert.ok(!madeProgress(plan([true, false]), plan([false, false])));
    assert.ok(!madeProgress(plan([true]), plan([true])));
});

test('activity file round trip; a broken file starts empty', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stone-act-')), 'activity.json');
    assert.deepStrictEqual(loadActivity(file).days, []);
    saveActivity(file, addDay({ days: [] }, '2026-11-26'));
    assert.deepStrictEqual(loadActivity(file).days, ['2026-11-26']);
    fs.writeFileSync(file, '{ broken');
    assert.deepStrictEqual(loadActivity(file, () => { }).days, []);
});