// ============ Punkte & Rundenauswertung ============
// Reine Funktionen, damit die Spielregeln ohne DOM testbar bleiben.

export const PEAK_BONUS = 10;

export function scoreRound({ memes, votes, players, round }) {
  const denom = Math.max(1, players.length - 1);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || '?';

  const peakCount = {};
  for (const v of votes) {
    if (v.peak && v.peak !== v.selfId) peakCount[v.peak] = (peakCount[v.peak] || 0) + 1;
  }

  return memes.map((m) => {
    // Eigene Stimmen zählen nie – auch wenn ein Client sie schicken würde.
    const others = votes.filter((v) => v.selfId !== m.playerId);
    const up = others.filter((v) => (v.ups || []).includes(m.playerId)).map((v) => nameOf(v.selfId));
    const down = others.filter((v) => (v.downs || []).includes(m.playerId)).map((v) => nameOf(v.selfId));
    const meh = others.filter((v) => (v.mehs || []).includes(m.playerId)).map((v) => nameOf(v.selfId));
    const peaks = peakCount[m.playerId] || 0;
    const pts = Math.round(1000 * (up.length - down.length) / denom) + peaks * PEAK_BONUS;
    return { ...m, round, pts, up, down, meh, peaks };
  }).sort((a, b) => b.pts - a.pts);
}

/** Addiert die Rundenpunkte und die Peak-Hälfte auf die Gesamtwertung. */
export function applyTotals(totals, scores, votes) {
  for (const s of scores) totals.set(s.playerId, (totals.get(s.playerId) || 0) + s.pts);
  const byId = new Map(scores.map((s) => [s.playerId, s]));
  for (const v of votes) {
    if (v.peak && v.peak !== v.selfId && byId.has(v.peak)) {
      totals.set(v.selfId, (totals.get(v.selfId) || 0) + Math.round(byId.get(v.peak).pts / 2));
    }
  }
  return totals;
}
