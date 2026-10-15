/** What a title is. Comics and mangas share formats, the paged reader and labels; only the name differs. */
export type Kind = 'comic' | 'manga';

/** Whitelists a submitted kind: anything unknown is a comic. */
export const toKind = (value: unknown): Kind => (value === 'manga' ? 'manga' : 'comic');

/** "Cómic" / "Manga" for badges and pickers. */
export const kindLabel = (kind: string) => (kind === 'manga' ? 'Manga' : 'Cómic');

/** A route's kind: "Cómic" / "Manga", or "Mixta" when it has both. */
export const routeKindLabel = (kind: string) => (kind === 'mixed' ? 'Mixta' : kindLabel(kind));

/** Lowercase noun for running text: "un cómic", "el manga". */
export const kindWord = (kind: string) => (kind === 'manga' ? 'manga' : 'cómic');

/** Whether a title comes in episodes or in volumes ("tomos"). */
export type UnitType = 'episodio' | 'tomo';

/** Whitelists a submitted unit type: anything unknown is episodes. */
export const toUnitType = (value: unknown): UnitType => (value === 'tomo' ? 'tomo' : 'episodio');

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A title's words for its units: { one: 'tomo', many: 'tomos', One: 'Tomo', Many: 'Tomos' }. */
export function unitWords(type: unknown) {
  const one = toUnitType(type);
  const many = `${one}s`;
  return { one, many, One: capitalize(one), Many: capitalize(many) };
}
export type UnitWords = ReturnType<typeof unitWords>;

/** "1 tomo", "12 episodios". */
export const unitCount = (n: number, type: unknown) => `${n} ${n === 1 ? unitWords(type).one : unitWords(type).many}`;
