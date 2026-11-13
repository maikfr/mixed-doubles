import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, validateImport } from './backup';

function backup(player: Record<string, unknown>, format = BACKUP_FORMAT) {
  return {
    format,
    version: 1,
    state: {
      players: [{ id: 1, name: 'Alex', gender: 'F', ...player }],
      group: [],
      ko: [],
      qualified: null,
      nextId: 2,
    },
  };
}

describe('Backup naming compatibility', () => {
  it('accepts the English format and professional property', () => {
    expect(validateImport(backup({ professional: true })).players[0].professional).toBe(true);
  });
  it.each([true, false])('migrates the legacy professional flag %s', (professional) => {
    const player = validateImport(backup({ profi: professional }, 'mixed-doppelturnier'))
      .players[0];
    expect(player.professional).toBe(professional);
    expect(player).not.toHaveProperty('profi');
  });
  it('prefers the current flag when both spellings exist', () => {
    const player = validateImport(backup({ professional: false, profi: true })).players[0];
    expect(player.professional).toBe(false);
    expect(player).not.toHaveProperty('profi');
  });
  it.each(['experienced', 'developing', 'normal'])('migrates legacy skill %s', (skill) => {
    const player = validateImport(backup({ skill }, 'mixed-doppelturnier')).players[0];
    expect(player.professional).toBe(skill === 'experienced');
    expect(player).not.toHaveProperty('skill');
  });
  it('defaults missing flags to false', () => {
    expect(validateImport(backup({})).players[0].professional).toBe(false);
  });
  it('rejects invalid flags and unknown file formats', () => {
    expect(() => validateImport(backup({ professional: 'true' }))).toThrow();
    expect(() => validateImport(backup({ profi: 'true' }, 'mixed-doppelturnier'))).toThrow();
    expect(() => validateImport(backup({}, 'unknown'))).toThrow();
  });
});
