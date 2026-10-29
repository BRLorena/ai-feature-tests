/**
 * Minimal language identification for en / pt / es / fr, by counting function words
 * that are frequent in one language and rare in the others. Good enough for
 * paragraphs of financial advice; not meant for single words.
 */
const MARKERS: Record<string, string[]> = {
  en: ["the", "and", "your", "you", "is", "are", "of", "to", "with", "this", "on", "in"],
  pt: ["não", "você", "seu", "sua", "seus", "são", "uma", "do", "da", "dos", "das", "em", "com", "ao", "mais", "gastos"],
  es: ["el", "los", "las", "del", "y", "su", "sus", "es", "una", "por", "con", "más", "al", "gastos", "tu"],
  fr: ["le", "la", "les", "des", "du", "et", "est", "vous", "votre", "vos", "une", "pour", "avec", "sur", "au", "dépenses"],
};

export function detectLanguage(text: string): { language: string; scores: Record<string, number> } {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const scores: Record<string, number> = {};
  for (const [lang, markers] of Object.entries(MARKERS)) {
    const set = new Set(markers);
    scores[lang] = words.filter((w) => set.has(w)).length;
  }
  const language = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return { language, scores };
}
