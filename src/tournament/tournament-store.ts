import type { OnDestroy } from '@angular/core';
import { computed, Injectable } from '@angular/core';
import type { Gender, SetScore, Tournament } from './models.js';
import {
  MAX_GROUP_ROUNDS,
  KO_WIN_SETS,
  compareRank,
  qualificationCount,
  roundDone,
  scoreSet,
  standings,
  winnerTeam,
} from './rules.js';
import { draw } from './draw.js';
import { TournamentFileSession } from './file-session.js';

@Injectable({ providedIn: 'root' })
export class TournamentStore implements OnDestroy {
  private readonly file = new TournamentFileSession();
  readonly state = this.file.state;
  readonly women = computed(() => standings(this.state(), 'F'));
  readonly men = computed(() => standings(this.state(), 'M'));
  readonly linkedBackup = this.file.linkedBackup;
  readonly fileName = this.file.fileName;
  readonly notice = this.file.notice;
  readonly backupError = this.file.backupError;
  readonly restoringFile = this.file.restoringFile;
  readonly closingFile = this.file.closingFile;

  flushFile(): Promise<void> {
    return this.file.flushFile();
  }
  openTournamentFile(): Promise<void> {
    return this.file.openTournamentFile();
  }
  closeTournamentFile(): Promise<void> {
    return this.file.closeTournamentFile();
  }
  linkBackupFile(newSession = false): Promise<void> {
    return this.file.linkBackupFile(newSession);
  }
  ngOnDestroy(): void {
    this.file.destroy();
  }

  private change(edit: (state: Tournament) => void): void {
    if (this.closingFile()) throw new Error('Die Turnierdatei wird gerade geschlossen.');
    if (!this.linkedBackup())
      throw new Error('Bitte zuerst eine Turnierdatei anlegen oder öffnen.');
    const next = structuredClone(this.state());
    edit(next);
    this.file.commit(next);
  }
  addPlayer(name: string, gender: Gender, professional = false): void {
    this.change((s) => {
      if (s.group.length)
        throw new Error('Nach Turnierstart können keine Plätze hinzugefügt werden.');
      const clean = name.trim();
      if (!clean || clean.length > 80 || !['F', 'M'].includes(gender))
        throw new Error('Bitte Namen und Geschlecht angeben.');
      if (typeof professional !== 'boolean')
        throw new Error('Bitte eine gültige Profi-Angabe wählen.');
      if (s.players.some((p) => p.name.toLocaleLowerCase('de') === clean.toLocaleLowerCase('de')))
        throw new Error('Dieser Name ist bereits vorhanden.');
      s.players.push({ id: s.nextId++, name: clean, gender, professional });
    });
  }

  setKoExcluded(id: number, excluded: boolean): void {
    this.change((s) => {
      if (s.ko.length)
        throw new Error(
          'Zuerst die KO-Auslosung löschen. Bereits gespielte KO-Runden können nicht geändert werden.',
        );
      const player = s.players.find((p) => p.id === id);
      if (!player) throw new Error('Person nicht gefunden.');
      if (typeof excluded !== 'boolean') throw new Error('Ungültiger KO-Verzicht.');
      player.koExcluded = excluded;
    });
  }

  setPlayerProfessional(id: number, professional: boolean): void {
    this.change((s) => {
      const player = s.players.find((p) => p.id === id);
      if (!player) throw new Error('Person nicht gefunden.');
      if (typeof professional !== 'boolean')
        throw new Error('Bitte eine gültige Profi-Angabe wählen.');
      player.professional = professional;
    });
  }

  editPlayer(id: number, name: string, gender: Gender): void {
    this.change((s) => {
      const p = s.players.find((p) => p.id === id);
      if (!p) throw new Error('Person nicht gefunden.');
      const clean = name.trim();
      if (!clean || clean.length > 80) throw new Error('Bitte einen gültigen Namen angeben.');
      if (
        s.players.some(
          (x) => x.id !== id && x.name.toLocaleLowerCase('de') === clean.toLocaleLowerCase('de'),
        )
      )
        throw new Error('Dieser Name ist bereits vorhanden.');
      if (s.group.length && p.gender !== gender)
        throw new Error('Das Geschlecht eines Turnierplatzes bleibt nach Start fest.');
      p.name = clean;
      p.gender = gender;
    });
  }

  deletePlayer(id: number): void {
    this.change((s) => {
      if (s.group.length) throw new Error('Nach Turnierstart können Plätze nicht entfernt werden.');
      s.players = s.players.filter((p) => p.id !== id);
    });
  }

  drawGroup(): void {
    this.change((s) => {
      if (s.qualified) throw new Error('Keine weitere Runde möglich.');
      if (s.players.length % 4 || s.players.length < 16) {
        throw new Error(
          'Mindestens 16 Personen nötig; die Gesamtzahl muss durch vier teilbar sein.',
        );
      }
      if (s.group.length >= MAX_GROUP_ROUNDS)
        throw new Error('Es sind höchstens 10 Runden möglich.');
      s.group.push(
        draw(
          s,
          s.players.map((p) => p.id),
        ),
      );
    });
  }

  deleteGroupRound(index: number): void {
    this.change((s) => {
      if (s.qualified)
        throw new Error('Nach Beginn der KO-Qualifikation können Runden nicht gelöscht werden.');
      const round = s.group[index];
      if (!round) throw new Error('Runde nicht gefunden.');
      if (round.some((game) => game.sets.length))
        throw new Error('Eine Runde mit eingetragenen Ergebnissen kann nicht gelöscht werden.');
      s.group.splice(index, 1);
    });
  }

  deleteKoRound(index: number): void {
    this.change((s) => {
      const round = s.ko[index];
      if (!round) throw new Error('KO-Runde nicht gefunden.');
      if (round.some((game) => game.sets.length))
        throw new Error('Eine Runde mit eingetragenen Ergebnissen kann nicht gelöscht werden.');
      if (index !== s.ko.length - 1) throw new Error('Bitte zuerst die spätere KO-Runde löschen.');
      s.ko.pop();
      if (!s.ko.length) s.qualified = null;
    });
  }

  setCalled(phase: 'group' | 'ko', gameId: number, called: boolean): void {
    this.change((s) => {
      const rounds = phase === 'group' ? s.group : s.ko;
      const game = rounds.flat().find((g) => g.id === gameId);
      if (!game) throw new Error('Spiel nicht gefunden.');
      if (called && game.sets.length)
        throw new Error('Ein bereits begonnenes Spiel kann nicht als Next markiert werden.');
      game.called = called;
    });
  }

  setResult(phase: 'group' | 'ko', gameId: number, sets: SetScore[]): void {
    this.change((s) => {
      const rounds = phase === 'group' ? s.group : s.ko;
      const roundIndex = rounds.findIndex((r) => r.some((g) => g.id === gameId));
      if (roundIndex < 0) throw new Error('Spiel nicht gefunden.');
      const game = rounds[roundIndex].find((g) => g.id === gameId)!;
      const winsNeeded = phase === 'group' ? 0 : KO_WIN_SETS;
      if (phase === 'group' && sets.length > 2)
        throw new Error('Bitte höchstens zwei Sätze eingeben.');
      if (phase === 'ko' && sets.length > 2 * winsNeeded - 1) {
        throw new Error(`Dieses KO-Spiel benötigt ${winsNeeded} Gewinnsätze.`);
      }
      const wins = [0, 0];
      for (let i = 0; i < sets.length; i++) {
        const [a, b] = sets[i];
        scoreSet(a, b);
        if (phase === 'ko' && Math.max(...wins) >= winsNeeded)
          throw new Error('Nach dem entscheidenden Satz darf kein weiterer Satz folgen.');
        wins[a > b ? 0 : 1]++;
      }
      game.sets = sets;
      if (sets.length) game.called = false;
    });
  }

  qualifyFromRanking(): void {
    if (this.state().players.filter((p) => !p.koExcluded).length < 16)
      throw new Error('Für die KO-Phase sind mindestens 16 Personen ohne KO-Verzicht nötig.');
    const ids: number[] = [];
    for (const gender of ['F', 'M'] as const) {
      const ranking = standings(this.state(), gender).filter((p) => !p.koExcluded),
        count = qualificationCount(this.state(), gender);
      if (
        count > 0 &&
        ranking.length > count &&
        compareRank(ranking[count - 1], ranking[count]) === 0
      ) {
        throw new Error(
          'An der KO-Grenze sind Punktzahl und gewonnene Sätze gleich. Ein Stechen ist nötig.',
        );
      }
      ids.push(...ranking.slice(0, count).map((p) => p.id));
    }
    this.qualify(ids);
  }

  qualify(ids: number[]): void {
    this.change((s) => {
      if (!s.group.length || !s.group.every((round) => roundDone(round, 2)))
        throw new Error('Bitte zuerst alle Ergebnisse sämtlicher Runden speichern.');
      if (s.ko.length) throw new Error('Die KO-Phase wurde bereits ausgelost.');
      if (ids.length !== 16 || new Set(ids).size !== 16)
        throw new Error('Bitte genau 16 Personen auswählen.');
      if (ids.some((id) => !s.players.some((p) => p.id === id && !p.koExcluded)))
        throw new Error('Personen mit KO-Verzicht können nicht ausgewählt werden.');
      for (const gender of ['F', 'M'] as const) {
        const ranking = standings(s, gender).filter((p) => !p.koExcluded);
        const chosen = ranking.filter((p) => ids.includes(p.id));
        const others = ranking.filter((p) => !ids.includes(p.id));
        if (
          chosen.length !== qualificationCount(s, gender) ||
          chosen.some((c) => others.some((o) => compareRank(o, c) < 0))
        ) {
          throw new Error(
            `Bitte die Punktbesten auswählen: ${qualificationCount(s, 'F')} FLINTA* und ${qualificationCount(s, 'M')} Rest. Nur Gleichstände sind manuell entscheidbar.`,
          );
        }
      }
      s.qualified = ids;
      s.ko.push(draw(s, ids, 'ko'));
    });
  }

  drawKo(): void {
    this.change((s) => {
      if (!s.qualified || s.ko.length >= 3) throw new Error('KO-Auslosung nicht möglich.');
      let ids = s.qualified;
      if (s.ko.length) {
        const last = s.ko.at(-1)!;
        const wins = KO_WIN_SETS;
        if (!roundDone(last, wins, true))
          throw new Error('Bitte zuerst alle Ergebnisse der laufenden KO-Runde eingeben.');
        ids = last.flatMap((g) => winnerTeam(g, wins) ?? []);
      }
      s.ko.push(draw(s, ids, 'ko'));
    });
  }
}
