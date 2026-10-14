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
 * A label like "5", "E1" or "#12" would silently merge unrelated titles.
 */
export const isGenericLabel = (label: string) => {
  const v = label.trim();
  const letters = v.match(/\p{L}/gu)?.length ?? 0;
  return letters < 3 && v.length < 6;
};
