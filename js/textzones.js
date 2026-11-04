// Textzonen pro Built-in-Template (Anteile: yF = Anteil der Bildhöhe, fsF = Anteil der kürzeren Seite).
// Templates ohne Eintrag nutzen die Standard-Position oben/unten – bei Reaktionsbildern ist das der passende Textraum.
export const TEXT_ZONES = {
  drake: { top: { xF: 0.62, yF: 0.30, fsF: 0.07 }, bottom: { xF: 0.62, yF: 0.90, fsF: 0.07 } },
  'awesome-face': { top: { xF: 0.78, yF: 0.25, fsF: 0.08 }, bottom: { xF: 0.78, yF: 0.55, fsF: 0.08 } },
  'leinwand-gelb': { top: { yF: 0.30, fsF: 0.08 }, bottom: { yF: 0.62, fsF: 0.08 } },
  'leinwand-pink': { top: { yF: 0.30, fsF: 0.08 }, bottom: { yF: 0.62, fsF: 0.08 } },
};

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
