import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultEditorComponent } from './result-editor.component';
import type { Game, SetScore, Tournament } from './tournament/models';
import { TournamentStore } from './tournament/tournament-store';

describe('ResultEditorComponent', () => {
  let fixture: ComponentFixture<ResultEditorComponent>;
  const initialGame = (): Game => ({
    id: 1,
    teams: [
      [1, 2],
      [3, 4],
    ],
    sets: [],
  });
  const state = signal<Tournament>({ players: [], group: [], ko: [], qualified: null, nextId: 2 });
  const flushFile = vi.fn(async () => {});
  const setResult = vi.fn((phase: 'group' | 'ko', id: number, sets: SetScore[]) => {
    const game = { ...initialGame(), id, sets };
    state.update((current) => ({ ...current, [phase]: [[game]] }));
    fixture.componentRef.setInput('game', game);
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    setResult.mockClear();
    flushFile.mockReset().mockResolvedValue(undefined);
    state.set({ players: [], group: [[initialGame()]], ko: [], qualified: null, nextId: 2 });
    await TestBed.configureTestingModule({
      imports: [ResultEditorComponent],
      providers: [{ provide: TournamentStore, useValue: { state, setResult, flushFile } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ResultEditorComponent);
    fixture.componentRef.setInput('game', initialGame());
    fixture.componentRef.setInput('phase', 'group');
    fixture.componentRef.setInput('slots', [0, 1]);
    fixture.componentRef.setInput('visibleSlots', 2);
    fixture.componentRef.setInput('gameNumber', 1);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  function enter(index: number, value: string): void {
    const input = fixture.nativeElement.querySelectorAll('input')[index] as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }
  async function save(): Promise<void> {
    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();
  }

  it('saves a valid partial result once after typing settles', async () => {
    enter(0, '11');
    enter(1, '5');
    expect(setResult).not.toHaveBeenCalled();
    await save();
    expect(setResult).toHaveBeenCalledExactlyOnceWith('group', 1, [[11, 5]]);
    expect(flushFile).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Gespeichert');
    await vi.advanceTimersByTimeAsync(3000);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Gespeichert');
  });
  it('marks invalid fields through bindings and keeps the message visible', async () => {
    enter(0, '11');
    enter(1, '10');
    await save();
    expect(setResult).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Satz 1:');
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ungültiges Ergebnis.');
    enter(1, '9');
    await save();
    expect(fixture.nativeElement.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('Ungültiges Ergebnis.');
  });
  it('preserves saved scores during an incomplete edit and allows clearing them', async () => {
    enter(0, '11');
    enter(1, '5');
    await save();
    enter(0, '');
    await save();
    expect(setResult).toHaveBeenCalledTimes(1);
    expect(state().group[0][0].sets).toEqual([[11, 5]]);
    enter(1, '');
    await save();
    expect(setResult).toHaveBeenLastCalledWith('group', 1, []);
  });
  it('does not report success when the file write fails', async () => {
    flushFile.mockRejectedValueOnce(new Error('Storage unavailable'));
    enter(0, '11');
    enter(1, '5');
    await save();
    expect(fixture.nativeElement.textContent).toContain('Storage unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Gespeichert');
  });
  it('preserves an unfinished draft when another saved game changes', () => {
    enter(0, '11');
    fixture.componentRef.setInput('game', { ...initialGame() });
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('11');
  });
});
