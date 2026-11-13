import { describe, expect, it } from 'vitest';
import { readResultInput } from './result-input';

describe('Result input', () => {
  it('accepts complete sets including deuce without normalizing stored scores', () => {
    expect(
      readResultInput([
        { left: 18, right: 16 },
        { left: 5, right: 11 },
      ]),
    ).toEqual({
      kind: 'valid',
      sets: [
        [18, 16],
        [5, 11],
      ],
    });
  });
  it('accepts clearing all scores or a trailing set', () => {
    expect(readResultInput([{ left: null, right: null }])).toEqual({ kind: 'valid', sets: [] });
    expect(
      readResultInput([
        { left: 11, right: 3 },
        { left: null, right: null },
      ]),
    ).toEqual({ kind: 'valid', sets: [[11, 3]] });
  });
  it('keeps half-empty edits incomplete', () => {
    expect(readResultInput([{ left: null, right: 3 }])).toEqual({ kind: 'incomplete' });
    expect(readResultInput([{ left: 11, right: null }])).toEqual({ kind: 'incomplete' });
  });
  it('reports a gap before another entered set', () => {
    expect(
      readResultInput([
        { left: null, right: null },
        { left: 11, right: 0 },
      ]),
    ).toMatchObject({ kind: 'invalid', slot: 0 });
  });
  it.each([
    [11, 10],
    [12, 9],
    [-1, 11],
    [11.5, 0],
  ])('rejects %s:%s', (left, right) => {
    expect(readResultInput([{ left, right }])).toMatchObject({ kind: 'invalid', slot: 0 });
  });
});
