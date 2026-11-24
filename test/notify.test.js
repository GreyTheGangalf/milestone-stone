// Run with node --test: npm test
const test = require('node:test');
const assert = require('node:assert');
const { findNewlyCompleted, completionMessage, progressSummary, MESSAGES } = require('../notify');

function state(items, status = 'active') {
    return {
        current: 0,
        milestones: [
            { id: 'M0', title: 'Kurulum', status, items: items.map(done => ({ text: 'x' + Math.random(), done })) },
            { id: 'M1', title: 'Veri', status: 'pending', items: [{ text: 'a', done: false }] }
        ]
    };
}

test('a milestone whose last item gets ticked is reported', () => {
    const found = findNewlyCompleted(state([true, false]), state([true, true]));
    assert.deepStrictEqual(found.map(m => m.id), ['M0']);
});

test('an already completed milestone is not reported again', () => {
    assert.deepStrictEqual(findNewlyCompleted(state([true, true]), state([true, true])), []);
});

test('nothing is reported on the first look (no previous state)', () => {
    assert.deepStrictEqual(findNewlyCompleted(null, state([true, true])), []);
});

test('sealed, pending and empty milestones are not "completed"', () => {
    assert.deepStrictEqual(findNewlyCompleted(state([true, false]), state([true, true], 'done')), []);
    assert.deepStrictEqual(findNewlyCompleted(state([true, false]), state([true, true], 'pending')), []);
    assert.deepStrictEqual(findNewlyCompleted(state([false]), state([])), []);
});

test('a paused milestone that gets completed is reported', () => {
    assert.strictEqual(findNewlyCompleted(state([false], 'paused'), state([true], 'paused')).length, 1);
});

test('the message names the milestone and uses one of the lines', () => {
    const { title, body } = completionMessage({ id: 'M2', title: 'Arayüz' }, () => 0.999);
    assert.strictEqual(title, 'M2 tamamlandı: Arayüz');
    assert.ok(body.startsWith(MESSAGES[MESSAGES.length - 1]));
});

test('tray tooltip shows the current milestone and its progress', () => {
    assert.strictEqual(progressSummary(state([true, false, false, true])), 'Milestone Taşı · M0 %50');
    const s = state([true]); s.current = 2;
    assert.strictEqual(progressSummary(s), 'Milestone Taşı · hepsi mühürlendi');
});