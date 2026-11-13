import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { Gender, Game, Player, RankedPlayer } from './tournament/index';
import {
  TournamentStore,
  roundDone,
  winnerTeam,
  MAX_GROUP_ROUNDS,
  qualificationCount,
  compareRank,
  KO_WIN_SETS,
} from './tournament/index';
import { RoundComponent } from './round.component';
import { FitTableDirective } from './fit-table.directive';
import { FitProjectionDirective } from './fit-projection.directive';

type ProjectorRound = { games: Game[]; index: number; phase: 'group' | 'ko'; title: string };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RoundComponent, FitTableDirective, FitProjectionDirective],
  host: { '(window:hashchange)': 'updateProjection()' },
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly store = inject(TournamentStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedbackTimers = new Set<ReturnType<typeof setTimeout>>();
  protected readonly maxGroupRounds = MAX_GROUP_ROUNDS;
  protected readonly state = this.store.state;
  protected readonly projector = signal(location.hash.startsWith('#projector'));
  protected readonly editingId = signal<number | null>(null);
  protected readonly message = signal('');
  protected readonly messageError = signal(false);
  protected readonly playerSavedAt = signal(new Map<number, number>());
  protected readonly genders: Gender[] = ['F', 'M'];
  protected readonly playerIndex = computed(
    () => new Map(this.state().players.map((player) => [player.id, player])),
  );
  protected readonly registrations = computed(() => ({
    F: this.state()
      .players.filter((player) => player.gender === 'F')
      .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    M: this.state()
      .players.filter((player) => player.gender === 'M')
      .sort((a, b) => a.name.localeCompare(b.name, 'de')),
  }));
  protected readonly professionalCounts = computed(() => ({
    F: this.registrations().F.filter((player) => player.professional).length,
    M: this.registrations().M.filter((player) => player.professional).length,
  }));
  protected readonly qualification = computed(() => {
    const status = new Map<number, 'qualifiziert' | 'gleichstand'>();
    for (const gender of this.genders) {
      const eligible = this.players(gender).filter((player) => !player.koExcluded);
      const count = qualificationCount(this.state(), gender);
      const cutoff = eligible[count - 1];
      if (!cutoff) continue;
      const tied = eligible.length > count && compareRank(cutoff, eligible[count]) === 0;
      for (const player of eligible) {
        const rank = compareRank(player, cutoff);
        if (rank > 0) continue;
        if (rank === 0 && tied) {
          if (player.points || player.setsWon) status.set(player.id, 'gleichstand');
        } else status.set(player.id, 'qualifiziert');
      }
    }
    return status;
  });
  protected readonly roundViews = computed(() => {
    const group: ProjectorRound[] = this.state().group.map((games, index) => ({
      games,
      index,
      phase: 'group',
      title: this.groupTitle(index),
    }));
    const ko: ProjectorRound[] = this.state().ko.map((games, index) => ({
      games,
      index,
      phase: 'ko',
      title: this.koTitle(index),
    }));
    const rounds = [...ko.reverse(), ...group.reverse()];
    const active = rounds.filter(
      (round) =>
        !roundDone(round.games, round.phase === 'ko' ? KO_WIN_SETS : 2, round.phase === 'ko'),
    );
    const completed = rounds.filter((round) =>
      roundDone(round.games, round.phase === 'ko' ? KO_WIN_SETS : 2, round.phase === 'ko'),
    );
    return { active, completed };
  });
  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timer of this.feedbackTimers) clearTimeout(timer);
    });
  }

  private later(task: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.feedbackTimers.delete(timer);
      task();
    }, delay);
    this.feedbackTimers.add(timer);
  }

  protected started(): boolean {
    return this.state().group.length > 0;
  }

  protected updateProjection(): void {
    this.projector.set(location.hash.startsWith('#projector'));
  }

  protected openProjector(): void {
    const url = new URL(window.location.href);
    url.hash = 'projector';
    window.open(url.href, '_blank', 'noopener');
  }

  protected players(gender: Gender): RankedPlayer[] {
    return gender === 'F' ? this.store.women() : this.store.men();
  }
  protected genderName(gender: Gender): string {
    return gender === 'F' ? 'FLINTA*' : 'Rest';
  }
  protected name(id: number): string {
    return this.playerIndex().get(id)?.name ?? '?';
  }
  protected team(ids: number[]): string {
    return ids.map((id) => this.name(id)).join(' & ');
  }
  protected count(gender: Gender): number {
    return this.registrations()[gender].length;
  }
  protected startReady(): boolean {
    return this.state().players.length % 4 === 0 && this.state().players.length >= 16;
  }
  protected canQualify(): boolean {
    return (
      this.state().players.filter((p) => !p.koExcluded).length >= 16 &&
      this.state().group.length > 0 &&
      this.state().group.every((round) => roundDone(round, 2))
    );
  }
  protected hasCompletedRound(): boolean {
    return this.state().group.some((round) => roundDone(round, 2));
  }
  protected projectorRounds(active: boolean): ProjectorRound[] {
    return active ? this.roundViews().active : this.roundViews().completed;
  }
  protected koReady(): boolean {
    const ko = this.state().ko;
    return (
      !!this.state().qualified &&
      ko.length < 3 &&
      (!ko.length || roundDone(ko.at(-1), KO_WIN_SETS, true))
    );
  }

  protected finished(): boolean {
    return this.state().ko.length === 3 && roundDone(this.state().ko[2], 3, true);
  }
  protected winner(): string {
    const game = this.state().ko[2]?.[0];
    return game ? this.team(winnerTeam(game, 3) ?? []) : '';
  }
  protected phaseName(): string {
    if (!this.started()) return 'Anmeldung';
    if (this.state().ko.length)
      return ['Viertelfinale', 'Halbfinale', 'Finale'][this.state().ko.length - 1];
    return this.state().qualified ? 'KO-Start' : 'Gruppenphase';
  }
  protected groupTitle(index: number): string {
    return `Runde ${index + 1}`;
  }
  protected koTitle(index: number): string {
    return ['Viertelfinale', 'Halbfinale', 'Finale'][index];
  }
  protected projectedQualification(player: RankedPlayer): 'qualifiziert' | 'gleichstand' | '' {
    return this.qualification().get(player.id) ?? '';
  }
  protected sortedPlayers(gender: Gender): Player[] {
    return this.registrations()[gender];
  }

  private async run(task: () => void, notify = true): Promise<boolean> {
    try {
      task();
      await this.store.flushFile();
      if (notify) this.flash('Gespeichert');
      return true;
    } catch (error) {
      this.flash(error instanceof Error ? error.message : String(error), true);
      return false;
    }
  }
  private async saveParticipant(id: number, task: () => void): Promise<boolean> {
    if (!(await this.run(task, false))) return false;
    const stamp = Date.now();
    this.playerSavedAt.update((values) => new Map(values).set(id, stamp));
    this.later(
      () =>
        this.playerSavedAt.update((values) => {
          const next = new Map(values);
          if (next.get(id) === stamp) next.delete(id);
          return next;
        }),
      3000,
    );
    return true;
  }
  private flash(text: string, error = false): void {
    this.message.set(text);
    this.messageError.set(error);
    this.later(() => {
      if (this.message() === text) this.message.set('');
    }, 6000);
  }
  protected async addPlayer(
    event: Event,
    name: string,
    gender: string,
    professional: boolean,
  ): Promise<void> {
    event.preventDefault();
    if (
      await this.saveParticipant(this.state().nextId, () =>
        this.store.addPlayer(name, gender as Gender, professional),
      )
    )
      (event.target as HTMLFormElement).reset();
  }
  protected async updatePlayerName(id: number, input: HTMLInputElement): Promise<void> {
    const player = this.state().players.find((p) => p.id === id);
    if (!player || input.value.trim() === player.name) return;
    if (
      !(await this.saveParticipant(id, () => this.store.editPlayer(id, input.value, player.gender)))
    )
      input.value = this.name(id);
  }
  protected async updatePlayerGender(id: number, select: HTMLSelectElement): Promise<void> {
    const player = this.state().players.find((p) => p.id === id);
    if (!player || select.value === player.gender) return;
    if (
      !(await this.saveParticipant(id, () =>
        this.store.editPlayer(id, player.name, select.value as Gender),
      ))
    )
      select.value = player.gender;
  }
  protected setKoExcluded(id: number, excluded: boolean): void {
    void this.saveParticipant(id, () => this.store.setKoExcluded(id, excluded));
  }
  protected setPlayerProfessional(id: number, professional: boolean): void {
    void this.saveParticipant(id, () => this.store.setPlayerProfessional(id, professional));
  }
  protected deletePlayer(id: number): void {
    if (confirm(`${this.name(id)} wirklich entfernen?`))
      void this.run(() => this.store.deletePlayer(id), false);
  }
  protected drawGroup(): void {
    void this.run(() => this.store.drawGroup());
  }
  protected drawKo(): void {
    void this.run(() => this.store.drawKo());
  }
  protected drawQuarterfinal(): void {
    void this.run(() => this.store.qualifyFromRanking());
  }
  protected async linkBackup(): Promise<void> {
    try {
      await this.store.linkBackupFile();
      this.flash('Datei-Backup verknüpft. Änderungen werden jetzt automatisch hineingeschrieben.');
    } catch (error) {
      this.flash(error instanceof Error ? error.message : String(error), true);
    }
  }
  protected async newTournament(): Promise<void> {
    try {
      await this.store.linkBackupFile(true);
      this.flash('Neues Turnier angelegt.');
    } catch (error) {
      this.flash(error instanceof Error ? error.message : String(error), true);
    }
  }
  protected async openTournament(): Promise<void> {
    try {
      await this.store.openTournamentFile();
      this.flash('Turnierdatei geöffnet.');
    } catch (error) {
      this.flash(error instanceof Error ? error.message : String(error), true);
    }
  }
  protected async closeTournament(): Promise<void> {
    try {
      await this.store.closeTournamentFile();
      this.editingId.set(null);
      this.flash('Datei geschlossen.');
    } catch (error) {
      this.flash(error instanceof Error ? error.message : String(error), true);
    }
  }
  protected canLinkBackup(): boolean {
    return 'showSaveFilePicker' in window;
  }
}
