/** True when an item (its lower-case `data-s` search text) should be hidden for the typed query. */
export function isFilteredOut(searchText: string | undefined, query: string) {
  const q = query.trim().toLowerCase();
  return !!q && !(searchText ?? '').includes(q);
}
