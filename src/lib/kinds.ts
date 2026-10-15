/** What a title is. Comics and mangas share formats, the paged reader and labels; only the name differs. */
export type Kind = 'comic' | 'manga';

/** Whitelists a submitted kind: anything unknown is a comic. */
export const toKind = (value: unknown): Kind => (value === 'manga' ? 'manga' : 'comic');

/** "Cómic" / "Manga" for badges and pickers. */
export const kindLabel = (kind: string) => (kind === 'manga' ? 'Manga' : 'Cómic');

/** Lowercase noun for running text: "un cómic", "el manga". */
export const kindWord = (kind: string) => (kind === 'manga' ? 'manga' : 'cómic');
