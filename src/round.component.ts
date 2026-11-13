import { Component, computed, inject, input, signal } from '@angular/core';
import type { Game } from './tournament/index';
import { TournamentStore, winnerTeam, KO_WIN_SETS, scoreSet } from './tournament/index';
import { ResultEditorComponent } from './result-editor.component';
import { FitTableDirective } from './fit-table.directive';

@Component({
  selector: 'app-round',
  standalone: true,
  imports: [FitTableDirective, ResultEditorComponent],
  templateUrl: './round.component.html',
})
export class RoundComponent {
  readonly games = input.required<Game[]>();
  readonly title = input.required<string>();
  readonly phase = input.required<'group' | 'ko'>();
  readonly index = input.required<number>();
  readonly editable = input(false);
  readonly showTitle = input(true);
  protected readonly store = inject(TournamentStore);
  protected readonly error = signal('');
  protected readonly slots = computed(() =>
    Array.from(
      {
        length: Math.max(
          this.phase() === 'group' ? 2 : 3,
          ...this.games().map((game) => this.slotCount(game)),
        ),
      },
      (_, i) => i,
    ),
  );
  protected readonly playerIndex = computed(
    () => new Map(this.store.state().players.map((player) => [player.id, player])),
  );
  protected readonly partnerHistory = computed(() => {
    const history = new Map<string, string[]>();
    if (!this.editable()) return new Map<string, string>();
    const rounds = this.store.state()[this.phase()].slice(0, this.index());
    for (const [index, games] of rounds.entries()) {
      const title =
        this.phase() === 'group'
          ? `Runde ${index + 1}`
          : ['Viertelfinale', 'Halbfinale', 'Finale'][index];
      for (const game of games)
        for (const team of game.teams) {
          const key = [...team].sort((a, b) => a - b).join(':');
          const titles = history.get(key) ?? [];
          if (!titles.includes(title)) titles.push(title);
          history.set(key, titles);
        }
    }
    return new Map([...history].map(([key, titles]) => [key, titles.join(', ')]));
  });
  protected gameWinner(game: Game): [number, number] | null {
    return winnerTeam(game);
  }
  protected gameComplete(game: Game): boolean {
    return this.phase() === 'group' ? game.sets.length === 2 : !!this.gameWinner(game);
  }

  protected setScore(game: Game): string {
    if (!game.sets.length) return '–';
    const left = game.sets.filter(([a, b]) => a > b).length;
    return `${left}:${game.sets.length - left}`;
  }

  protected teamPoints(game: Game, side: 0 | 1): number {
    return game.sets.reduce((sum, [a, b]) => sum + scoreSet(a, b)[side], 0);
  }

  protected gamesHaveResults(): boolean {
    return this.games().some((game) => game.sets.length > 0);
  }
  protected async setCalled(game: Game, called: boolean): Promise<void> {
    try {
      this.error.set('');
      this.store.setCalled(this.phase(), game.id, called);
      await this.store.flushFile();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
  protected async deleteRound(): Promise<void> {
    if (!confirm(`${this.title()} wirklich löschen? Die Auslosung dieser Runde geht verloren.`))
      return;
    try {
      if (this.phase() === 'group') this.store.deleteGroupRound(this.index());
      else this.store.deleteKoRound(this.index());
      await this.store.flushFile();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected slotCount(game: Game): number {
    if (this.phase() === 'group') return 2;
    return Math.min(
      2 * KO_WIN_SETS - 1,
      Math.max(3, game.sets.length + (this.gameComplete(game) ? 0 : 1)),
    );
  }
  protected playerName(id: number): string {
    return this.playerIndex().get(id)?.name ?? '?';
  }
  protected isProfessional(id: number): boolean {
    return !!this.playerIndex().get(id)?.professional;
  }
  protected previousRounds(ids: number[]): string {
    return this.partnerHistory().get([...ids].sort((a, b) => a - b).join(':')) ?? '';
  }
  protected score(game: Game): string {
    return game.sets.length ? game.sets.map(([a, b]) => `${a}:${b}`).join(' · ') : '–';
  }
}
