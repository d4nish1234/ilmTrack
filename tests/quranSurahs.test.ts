import { describe, it, expect } from 'vitest';
import { QURAN_SURAHS, surahAyahRangeProblem } from '../src/data/quranSurahs';

const fatihah = QURAN_SURAHS[0];
const nas = QURAN_SURAHS[QURAN_SURAHS.length - 1];
const empty = { fromSurah: null, fromAyah: null, toSurah: null, toAyah: null };

describe('surahAyahRangeProblem (Quran Mode homework)', () => {
  it('asks for the start when nothing is chosen', () => {
    expect(surahAyahRangeProblem(empty)).toBe('Choose the surah and ayah it starts from.');
  });

  it('asks for the end when only the start is chosen', () => {
    expect(surahAyahRangeProblem({ ...empty, fromSurah: fatihah, fromAyah: 1 })).toBe(
      'Choose the surah and ayah it ends at.'
    );
    expect(surahAyahRangeProblem({ ...empty, fromSurah: fatihah, fromAyah: 1, toSurah: fatihah })).toBe(
      'Choose the surah and ayah it ends at.'
    );
  });

  it('asks for the start ayah when only its surah is chosen', () => {
    expect(surahAyahRangeProblem({ fromSurah: fatihah, fromAyah: null, toSurah: fatihah, toAyah: 7 })).toBe(
      'Choose the surah and ayah it starts from.'
    );
  });

  it('accepts a complete range, including one running backwards', () => {
    expect(surahAyahRangeProblem({ fromSurah: fatihah, fromAyah: 1, toSurah: fatihah, toAyah: 7 })).toBeNull();
    expect(surahAyahRangeProblem({ fromSurah: nas, fromAyah: 1, toSurah: fatihah, toAyah: 1 })).toBeNull();
  });
});
