import { describe, it, expect } from 'vitest';
import { filterPeople, peopleSummary, pickResult } from '../src/utils/peoplePicker';

const people = [
  { uid: 'a', name: 'Aisha Khan' },
  { uid: 'b', name: 'Omar Ali' },
  { uid: 'c', name: 'Sara Malik' },
];

describe('peopleSummary', () => {
  it('names one or two people and counts more', () => {
    expect(peopleSummary(null)).toBe('Everyone');
    expect(peopleSummary([])).toBe('No one yet');
    expect(peopleSummary(['Aisha Khan'])).toBe('Aisha Khan');
    expect(peopleSummary(['Aisha Khan', 'Omar Ali'])).toBe('Aisha Khan and Omar Ali');
    expect(peopleSummary(['A', 'B', 'C'])).toBe('3 people');
  });

  it('reads a full list as all of them', () => {
    expect(peopleSummary(['A', 'B', 'C'], 3)).toBe('All 3 people');
    expect(peopleSummary(['A', 'B'], 2)).toBe('A and B');
    expect(peopleSummary(['A', 'B', 'C'], 5)).toBe('3 people');
  });
});

describe('pickResult', () => {
  it('returns the ticked people in list order', () => {
    expect(pickResult(people, new Set(['c', 'a']), true)).toEqual(['a', 'c']);
  });

  it('returns everyone (null) only where the list offers it', () => {
    expect(pickResult(people, new Set(['a', 'b', 'c']), true)).toBeNull();
    expect(pickResult(people, new Set(['a', 'b', 'c']), false)).toEqual(['a', 'b', 'c']);
  });

  it('ignores ticks for people no longer listed', () => {
    expect(pickResult(people, new Set(['a', 'gone']), false)).toEqual(['a']);
  });
});

describe('filterPeople', () => {
  it('matches any part of the name, ignoring case and spaces around', () => {
    expect(filterPeople(people, '  ali ').map((p) => p.uid)).toEqual(['b', 'c']);
    expect(filterPeople(people, '')).toBe(people);
  });
});
