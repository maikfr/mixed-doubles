import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FitTableDirective } from './fit-table.directive';
import { RoundComponent } from './round.component';
import type { Game, SetScore, Tournament } from './tournament/models';
import { TournamentStore } from './tournament/tournament-store';

describe('RoundComponent', () => {
  let fixture: ComponentFixture<RoundComponent>;
  const state = signal<Tournament>({ players: [], group: [], ko: [], qualified: null, nextId: 3 });
  beforeEach(async () => {
    state.set({ players: [], group: [], ko: [], qualified: null, nextId: 3 });
    await TestBed.configureTestingModule({
      imports: [RoundComponent],
      providers: [
        { provide: TournamentStore, useValue: { state, flushFile: vi.fn(async () => {}) } },
      ],
    })
      .overrideComponent(RoundComponent, { remove: { imports: [FitTableDirective] } })
      .compileComponents();
    fixture = TestBed.createComponent(RoundComponent);
    fixture.componentRef.setInput('title', 'Test');
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('editable', true);
  });
  function show(sets: SetScore[], phase: 'group' | 'ko' = 'ko'): void {
    const game: Game = {
      id: 1,
      teams: [
        [1, 2],
        [3, 4],
      ],
      sets,
    };
    state.update((value) => ({ ...value, [phase]: [[game]] }));
    fixture.componentRef.setInput('phase', phase);
    fixture.componentRef.setInput('games', [game]);
    fixture.detectChanges();
  }
  it('starts with three KO sets and adds the fourth and fifth only when needed', () => {
    show([]);
    expect(fixture.nativeElement.querySelectorAll('.set')).toHaveLength(3);
    show([
      [11, 5],
      [5, 11],
      [11, 5],
    ]);
    expect(fixture.nativeElement.querySelectorAll('.set')).toHaveLength(4);
    show([
      [11, 5],
      [5, 11],
      [11, 5],
      [5, 11],
    ]);
    expect(fixture.nativeElement.querySelectorAll('.set')).toHaveLength(5);
  });
  it('keeps a finished three-set match at three sets and marks its row completed', () => {
    show([
      [11, 5],
      [11, 5],
      [11, 5],
    ]);
    expect(fixture.nativeElement.querySelectorAll('.set')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.completed-game')).not.toBeNull();
  });
  it('uses exactly two sets in the group phase', () => {
    show([], 'group');
    expect(fixture.nativeElement.querySelectorAll('.set')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.completed-game')).toBeNull();
  });
  it('displays only the set score in the projection and normalized team points', () => {
    fixture.componentRef.setInput('editable', false);
    show(
      [
        [18, 16],
        [5, 11],
      ],
      'group',
    );
    expect(fixture.nativeElement.querySelector('app-result-editor')).toBeNull();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('(+16)');
    expect(text).toContain('(+20)');
    expect(text).toContain('1:1');
  });
});
