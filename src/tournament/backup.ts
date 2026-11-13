import type { Player, Tournament } from './models.js';
import { scoreSet } from './rules.js';
export const BACKUP_FORMAT = 'mixed-doubles-tournament';
const LEGACY_BACKUP_FORMAT = 'mixed-doppelturnier';

export function validateImport(value: unknown): Tournament {
  if (typeof value !== 'object' || value === null) throw new Error('Ungültige JSON-Datei.');
  const backup = value as Record<string, unknown>;
  if (
    ![BACKUP_FORMAT, LEGACY_BACKUP_FORMAT].includes(String(backup['format'])) ||
    backup['version'] !== 1
  )
    throw new Error('Unbekanntes Backup-Format.');
  const state = backup['state'] as Tournament | undefined;
  if (
    !state ||
    !Array.isArray(state.players) ||
    !Array.isArray(state.group) ||
    !Array.isArray(state.ko) ||
    !Number.isInteger(state.nextId)
  ) {
    throw new Error('Das Backup enthält keinen gültigen Turnierstand.');
  }
  const ids = new Set<number>();
  for (const p of state.players) {
    if (
      !Number.isInteger(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      !['F', 'M'].includes(p.gender)
    ) {
      throw new Error('Ungültige Teilnehmerdaten im Backup.');
    }
    ids.add(p.id);
    const legacy = p as Player & { profi?: unknown; skill?: unknown };
    if (p.professional === undefined)
      p.professional = (legacy.profi ?? legacy.skill === 'experienced') as boolean;
    if (typeof p.professional !== 'boolean') throw new Error('Ungültige Profi-Angabe im Backup.');
    delete legacy.profi;
    delete legacy.skill;
    if (p.koExcluded !== undefined && typeof p.koExcluded !== 'boolean')
      throw new Error('Ungültiger KO-Verzicht im Backup.');
  }
  for (const round of [...state.group, ...state.ko]) {
    if (!Array.isArray(round)) throw new Error('Ungültige Runde im Backup.');
    for (const game of round) {
      if (
        !Array.isArray(game.teams) ||
        game.teams.length !== 2 ||
        !Array.isArray(game.sets) ||
        game.teams.some(
          (team) => !Array.isArray(team) || team.length !== 2 || team.some((id) => !ids.has(id)),
        )
      ) {
        throw new Error('Ungültiges Spiel im Backup.');
      }
      for (const set of game.sets) scoreSet(set[0], set[1]);
      if (game.sets.length) game.called = false;
    }
  }
  if (!state.ko.length) state.qualified = null;
  return state;
}
