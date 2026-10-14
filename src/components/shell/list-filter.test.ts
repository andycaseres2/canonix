import { describe, expect, it } from 'vitest';
import { isFilteredOut } from './list-filter';

describe('isFilteredOut', () => {
  it('keeps everything when the query is empty or blank', () => {
    expect(isFilteredOut('spider-man marvel', '')).toBe(false);
    expect(isFilteredOut('spider-man marvel', '   ')).toBe(false);
  });

  it('hides items whose search text does not contain the query, ignoring case and outer spaces', () => {
    expect(isFilteredOut('spider-man stan lee marvel', '  Spider ')).toBe(false);
    expect(isFilteredOut('naruto studio pierrot anime', 'spider')).toBe(true);
  });

  it('hides items without search text when there is a query', () => {
    expect(isFilteredOut(undefined, 'x')).toBe(true);
  });
});
