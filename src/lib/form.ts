export const str = (f: FormData, k: string, max = 500) => {
  const v = String(f.get(k) ?? '').trim().slice(0, max);
  return v === '' ? null : v;
};
export const url = (f: FormData, k: string) => {
  const v = str(f, k, 1000);
  return v && /^https:\/\//i.test(v) ? v : null;
};
export const yearStart = (label: string | null) => {
  const m = label?.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
};
