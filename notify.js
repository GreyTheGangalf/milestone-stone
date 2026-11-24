// Milestone Stone — finds milestones that were just completed, and words the
// notification for them. The notification itself is shown by main.js.
// Has no Electron dependency, so it can be tested with `node --test`.

// A milestone is "completed" when it is still open (active or paused) and
// every item of its definition of done is ticked. Sealing it is the next step.
function isCompleted(m) {
    return !!m && (m.status === 'active' || m.status === 'paused')
        && Array.isArray(m.items) && m.items.length > 0 && m.items.every(it => it && it.done);
}

// Returns the milestones that are completed in `next` but were not in `prev`.
// Milestones are matched by id. With no `prev` (first look at the file)
// nothing is reported, so starting the widget never sends a notification.
function findNewlyCompleted(prev, next) {
    if (!prev || !Array.isArray(prev.milestones) || !next || !Array.isArray(next.milestones)) return [];
    const before = new Set(prev.milestones.filter(isCompleted).map(m => m.id));
    return next.milestones.filter(m => isCompleted(m) && !before.has(m.id));
}

// The user-facing texts are Turkish, like the rest of the stone.
const MESSAGES = [
    'Bir taş daha yerine oturdu. Yol artık biraz daha belli.',
    'Küçük adımlar birikti ve bir kilometre taşı oldu.',
    'Bitti dediğin şey gerçekten bitti. Bunu bir an kutla.',
    'Durmadın, bitirdin. Kısa bir molayı hak ettin.',
    'Sözünü tuttun. Sıradaki taş seni bekliyor.',
    'Bu taşı sen yonttun. İzini bırakmak için mühürle.'
];

function completionMessage(m, random = Math.random) {
    const line = MESSAGES[Math.floor(random() * MESSAGES.length) % MESSAGES.length];
    const title = m.title ? `${m.id} tamamlandı: ${m.title}` : `${m.id} tamamlandı`;
    return { title, body: `${line}\nTaşa tıklayıp geriye bakışını yazabilir ve mühürleyebilirsin.` };
}

// Short summary for the tray tooltip, e.g. "Milestone Taşı · M1 %60".
function progressSummary(state) {
    const name = 'Milestone Taşı';
    if (!state || !Array.isArray(state.milestones)) return name;
    const m = state.milestones[state.current];
    if (!m) return `${name} · hepsi mühürlendi`;
    const total = m.items.length;
    const done = m.items.filter(it => it.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    return `${name} · ${m.id} %${pct}${m.status === 'paused' ? ' (duraklatıldı)' : ''}`;
}

module.exports = { isCompleted, findNewlyCompleted, completionMessage, progressSummary, MESSAGES };