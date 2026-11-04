// Textzonen pro Built-in-Template (Anteile: yF = Anteil der Bildhöhe, fsF = Anteil der kürzeren Seite).
// Templates ohne Eintrag nutzen die Standard-Position oben/unten – bei Reaktionsbildern ist das der passende Textraum.
export const TEXT_ZONES = {
  'awesome-face': { top: { xF: 0.78, yF: 0.25, fsF: 0.08 }, bottom: { xF: 0.78, yF: 0.55, fsF: 0.08 } },
};

// Normierte Text-Layer (Anteile 0..1) – reine Funktion, damit der Smoke-Test sie prüfen kann
export function normLayers(layers) {
  if (!Array.isArray(layers)) return [];
  return layers.slice(0, 8)
    .map((l) => ({
      text: String(l.text || '').trim().slice(0, 200),
      xF: Math.min(1, Math.max(0, Number(l.xF) || 0.5)),
      yF: Math.min(1, Math.max(0, Number(l.yF) || 0.5)),
      fsF: Math.min(0.2, Math.max(0.03, Number(l.fsF) || 0.11)),
    }))
    .filter((l) => l.text);
}

export function zoneFor(id) {
  return TEXT_ZONES[String(id || '').replace(/^builtin_/, '')] || null;
}

// Layer-Patch für MemeCanvas aus einer Zone; null = Standardposition
export function layerPatch(mc, z) {
  if (!z) return null;
  const base = Math.min(mc.cw, mc.ch);
  const patch = { y: Math.round(mc.ch * z.yF), fontSize: Math.round(base * z.fsF), strokeWidth: Math.max(4, Math.round(base * z.fsF / 9)) };
  if (z.xF !== undefined) patch.x = Math.round(mc.cw * z.xF);
  return patch;
}
