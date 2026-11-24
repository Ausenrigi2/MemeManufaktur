// ============ Punkte & Rundenauswertung ============
// Reine Funktionen, damit die Spielregeln ohne DOM testbar bleiben.

export const PEAK_BONUS = 10;

export function scoreRound({ memes, votes, players, round }) {
  const denom = Math.max(1, players.length - 1);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || '?';

  return memes.map((m) => {
    // Eigene Stimmen zählen nie – auch wenn ein Client sie schicken würde.
    // Krocha/Gschissn/Najo bleiben anonym (nur Anzahl); nur Peaks nennen Namen.
    const others = votes.filter((v) => v.selfId !== m.playerId);
    const up = others.filter((v) => (v.ups || []).includes(m.playerId)).length;
    const down = others.filter((v) => (v.downs || []).includes(m.playerId)).length;
    const meh = others.filter((v) => (v.mehs || []).includes(m.playerId)).length;
    const peakBy = votes
      .filter((v) => v.peak === m.playerId && v.selfId !== m.playerId)
      .map((v) => nameOf(v.selfId));
    const peaks = peakBy.length;
    const pts = Math.round(1000 * (up - down) / denom) + peaks * PEAK_BONUS;
    return { ...m, round, pts, up, down, meh, peaks, peakBy };
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
