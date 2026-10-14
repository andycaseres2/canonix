export const str = (f: FormData, k: string, max = 500) => {
  const v = String(f.get(k) ?? '').trim().slice(0, max);
  return v === '' ? null : v;
};
export const url = (f: FormData, k: string) => {
  const v = str(f, k, 1000);
  return v && /^https:\/\//i.test(v) ? v : null;
};
export const int = (f: FormData, k: string) => {
  const n = parseInt(String(f.get(k) ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};
export const yearStart = (label: string | null) => {
  const m = label?.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
};
/**
 * Unit labels are global: two titles with the same label share progress.
 * A label like "5", "E1", "#12" or "Vol 1" would silently merge unrelated titles.
 */
const NUMBER_ONLY = /^[#\s\d.,\-–]+$/;
const GENERIC_WORD_AND_NUMBER = /^(vol|volumen|volume|cap|capitulo|capítulo|chapter|ch|ep|episodio|episode|issue|numero|número|no|n|parte|part|tomo)\.?\s*#?\s*\d+$/i;

export const isGenericLabel = (label: string) => {
  const v = label.trim();
  const letters = v.match(/\p{L}/gu)?.length ?? 0;
  return NUMBER_ONLY.test(v) || GENERIC_WORD_AND_NUMBER.test(v) || (letters < 3 && v.length < 6);
};
