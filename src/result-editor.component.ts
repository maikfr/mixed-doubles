import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, tap } from 'rxjs';
import { readResultInput } from './result-input';
import type { Game } from './tournament/models';
import { TournamentStore } from './tournament/tournament-store';

type SetForm = FormGroup<{ left: FormControl<number | null>; right: FormControl<number | null> }>;

@Component({
  selector: 'app-result-editor',
  imports: [ReactiveFormsModule],
  templateUrl: './result-editor.component.html',
  host: { style: 'display:block' },
})
export class ResultEditorComponent {
  readonly game = input.required<Game>();
  readonly phase = input.required<'group' | 'ko'>();
  readonly slots = input.required<number[]>();
  readonly visibleSlots = input.required<number>();
  readonly gameNumber = input.required<number>();
  protected readonly form = new FormArray<SetForm>(
    Array.from(
      { length: 5 },
      () =>
        new FormGroup({
          left: new FormControl<number | null>(null),
          right: new FormControl<number | null>(null),
        }),
    ),
  );
  protected readonly draft = signal(this.form.getRawValue());
  protected readonly validation = computed(() => readResultInput(this.draft()));
  protected readonly invalidSlot = computed(() => {
    const result = this.validation();
    return result.kind === 'invalid' ? result.slot : null;
  });
  protected readonly error = signal('');
  protected readonly savedAt = signal<number | null>(null);
  protected readonly savedMarkers = computed(() =>
    this.savedAt() === null ? [] : [this.savedAt()],
  );
  private readonly store = inject(TournamentStore);
  private readonly destroyRef = inject(DestroyRef);
  private baseline = '';
  private pending = false;
  private fadeTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;

  constructor() {
    effect(() => {
      const game = this.game();
      const snapshot = JSON.stringify(game.sets);
      if (snapshot !== this.baseline) {
        this.baseline = snapshot;
        this.form.setValue(
          this.form.controls.map((_, slot) => ({
            left: game.sets[slot]?.[0] ?? null,
            right: game.sets[slot]?.[1] ?? null,
          })),
          { emitEvent: false },
        );
        this.draft.set(this.form.getRawValue());
      }
      for (const [slot, group] of this.form.controls.entries()) {
        if (slot >= this.visibleSlots()) group.disable({ emitEvent: false });
        else group.enable({ emitEvent: false });
      }
    });
    this.form.valueChanges
      .pipe(
        tap(() => {
          this.revision++;
          this.pending = true;
          this.savedAt.set(null);
          this.error.set('');
          this.draft.set(this.form.getRawValue());
        }),
        debounceTime(500),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        void this.save();
      });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.fadeTimer);
      if (this.pending) void this.save();
    });
  }

  protected async save(): Promise<void> {
    if (!this.pending) return;
    this.pending = false;
    const result = this.validation();
    if (result.kind === 'incomplete') return;
    if (result.kind === 'invalid') {
      this.error.set(`Satz ${result.slot + 1}: ${result.message}`);
      return;
    }
    const rounds = this.store.state()[this.phase()];
    const game = rounds.flat().find((value) => value.id === this.game().id);
    if (!game || JSON.stringify(result.sets) === JSON.stringify(game.sets)) return;
    const revision = this.revision;
    try {
      this.store.setResult(this.phase(), game.id, result.sets);
      this.baseline = JSON.stringify(result.sets);
      await this.store.flushFile();
      if (this.destroyRef.destroyed || revision !== this.revision) return;
      this.error.set('');
      this.savedAt.set(Date.now());
      clearTimeout(this.fadeTimer);
      this.fadeTimer = setTimeout(() => this.savedAt.set(null), 3000);
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
