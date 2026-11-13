import type { SetScore } from './tournament/models';
import { scoreSet } from './tournament/rules';

export interface SetInput {
  left: number | null;
  right: number | null;
}
export type ResultInput =
  | { kind: 'valid'; sets: SetScore[] }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; slot: number; message: string };

/** Convert an editable draft without changing already stored results. */
export function readResultInput(values: readonly SetInput[]): ResultInput {
  const sets: SetScore[] = [];
  for (const [slot, { left, right }] of values.entries()) {
    if (left === null && right === null) {
      if (values.slice(slot + 1).some((value) => value.left !== null || value.right !== null)) {
        return {
          kind: 'invalid',
          slot,
          message:
            'Sätze bitte ohne Lücke eintragen oder die nachfolgenden Sätze ebenfalls leeren.',
        };
      }
      break;
    }
    if (left === null || right === null) return { kind: 'incomplete' };
    try {
      scoreSet(left, right);
    } catch (error) {
      return {
        kind: 'invalid',
        slot,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    sets.push([left, right]);
  }
  return { kind: 'valid', sets };
}
