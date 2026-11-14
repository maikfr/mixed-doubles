import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomInt as randomIndex } from 'node:crypto';

type SetScore = [number, number];
let scoreSeed = 753;
function randomInt(max: number): number {
  scoreSeed = (Math.imul(scoreSeed, 1664525) + 1013904223) >>> 0;
  return Math.floor((scoreSeed / 2 ** 32) * max);
}
function randomSet(): SetScore {
  const winner = randomInt(2);
  const deuce = randomInt(5) === 0;
  const high = deuce ? 12 + randomInt(5) : 11;
  const low = deuce ? high - 2 : randomInt(10);
  return winner === 0 ? [high, low] : [low, high];
}
function randomKnockoutResult(): { sets: SetScore[]; winnerSide: 0 | 1 } {
  const wins = [0, 0];
  const sets: SetScore[] = [];
  while (Math.max(...wins) < 3) {
    const score = randomSet();
    sets.push(score);
    wins[score[0] > score[1] ? 0 : 1]++;
  }
  return { sets, winnerSide: wins[0] === 3 ? 0 : 1 };
}

const participants = [
  ...[
    'Anna',
    'Beate',
    'Claudia',
    'Daniela',
    'Eva',
    'Franziska',
    'Gabi',
    'Hannah',
    'Ina',
    'Julia',
    'Katrin',
    'Laura',
    'Maria',
    'Nina',
    'Olivia',
    'Petra',
    'Rebecca',
    'Sabine',
    'Tanja',
    'Ulrike',
    'Vera',
    'Wiebke',
    'Yasmin',
    'Zoe',
  ].map((name, index) => ({ name, gender: 'F', professional: index < 12 })),
  ...[
    'Andreas',
    'Bernd',
    'Christian',
    'Daniel',
    'Dirk',
    'Erik',
    'Florian',
    'Georg',
    'Harald',
    'Ingo',
    'Jan',
    'Kai',
    'Lukas',
    'Martin',
    'Nils',
    'Oliver',
    'Peter',
    'Ralf',
    'Stefan',
    'Thomas',
    'Uwe',
    'Viktor',
    'Walter',
    'Yannick',
    'Anton',
    'Bastian',
    'David',
    'Emil',
  ].map((name, index) => ({ name, gender: 'M', professional: index < 14 })),
];
test('plays a complete tournament through the browser and persists the results', async ({
  page,
}, testInfo) => {
  // Reproducible random scores keep failures repeatable.
  scoreSeed = 753;
  const groupResults = Array.from({ length: 5 }, () =>
    Array.from({ length: participants.length / 4 }, () => [randomSet(), randomSet()]),
  );
  const knockoutResults = [4, 2, 1].map((count) =>
    Array.from({ length: count }, () => randomKnockoutResult()),
  );
  const tournamentPath = testInfo.outputPath('tournament.json');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeBinding('writeTournament', async (_, json: string) => {
    await writeFile(tournamentPath, json);
  });
  await page.exposeBinding('readTournament', () => readFile(tournamentPath, 'utf8'));
  // Native file dialogs cannot be controlled by Playwright. Replace only the picker/handle;
  // the application still validates, serializes, and writes every edit to an actual test file.
  await page.addInitScript(() => {
    // Mock handles contain functions and cannot be cloned into IndexedDB like native handles.
    // This test covers file contents, not remembering native file permissions across reloads.
    Reflect.deleteProperty(window, 'indexedDB');
    // Keep the draw reproducible without replacing any tournament rules.
    let seed = 42;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const bridge = window as unknown as {
      writeTournament(json: string): Promise<void>;
      readTournament(): Promise<string>;
      showSaveFilePicker: () => Promise<unknown>;
      showOpenFilePicker: () => Promise<unknown[]>;
    };
    const handle = {
      name: 'tournament.json',
      getFile: async () => new File([await bridge.readTournament()], 'tournament.json'),
      createWritable: async () => ({
        write: (json: string) => bridge.writeTournament(json),
        close: async () => {},
      }),
    };
    bridge.showSaveFilePicker = async () => handle;
    bridge.showOpenFilePicker = async () => [handle];
  });
  const saved = async () => JSON.parse(await readFile(tournamentPath, 'utf8')).state;
  await page.goto(pathToFileURL(resolve('dist/offline.html')).href);
  await page.getByRole('button', { name: 'Neues Turnier anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Anmeldung', exact: true })).toBeVisible();
  await expect(page.getByText(/Die Dateiverbindung konnte nicht gemerkt werden/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Neue Runde', exact: true })).toBeDisabled();

  for (const [index, participant] of participants.entries()) {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(participant.name);
    await page
      .getByRole('combobox', { name: 'Geschlecht', exact: true })
      .selectOption(participant.gender);
    await page
      .getByRole('checkbox', { name: 'Profi', exact: true })
      .setChecked(participant.professional);
    await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
    await expect.poll(async () => (await saved()).players.length).toBe(index + 1);
  }
  const registered = await saved();
  for (const gender of ['F', 'M']) {
    const group = registered.players.filter(
      (player: { gender: string }) => player.gender === gender,
    );
    expect(group.filter((player: { professional: boolean }) => player.professional)).toHaveLength(
      group.length / 2,
    );
  }

  async function enterSet(row: Locator, game: number, set: number, left: number, right: number) {
    await row
      .getByRole('spinbutton', { name: `Spiel ${game}, Satz ${set}, Team 1`, exact: true })
      .fill(String(left));
    const input = row.getByRole('spinbutton', {
      name: `Spiel ${game}, Satz ${set}, Team 2`,
      exact: true,
    });
    await input.fill(String(right));
    await input.blur();
  }

  for (let round = 0; round < 5; round++) {
    await page.getByRole('button', { name: '+ Neue Runde', exact: true }).click();
    await expect.poll(async () => (await saved()).group.length).toBe(round + 1);
    await expect(page.getByRole('heading', { name: 'Anmeldung', exact: true })).toHaveCount(0);
    const section = page.locator('details').filter({
      has: page.locator('summary', { hasText: `Runde ${round + 1} · Ergebnisse offen` }),
    });
    for (let game = 0; game < participants.length / 4; game++) {
      const row = section.locator('tbody tr').nth(game);
      if (round === 0 && game === 0) {
        await row.getByRole('checkbox').check();
        await enterSet(row, 1, 1, 11, 10);
        await expect(row.getByRole('alert')).toContainText('Ungültiges Ergebnis');
        expect((await saved()).group[0][0].sets).toHaveLength(0);
      }
      const results = groupResults[round][game];
      await enterSet(row, game + 1, 1, ...results[0]);
      await expect.poll(async () => (await saved()).group[round][game].sets.length).toBe(1);
      await expect(row.getByRole('checkbox')).toHaveCount(0);
      await enterSet(row, game + 1, 2, ...results[1]);
      await expect.poll(async () => (await saved()).group[round][game].sets.length).toBe(2);
    }
    const ids = (await saved()).group[round].flatMap((game: { teams: number[][] }) =>
      game.teams.flat(),
    );
    expect(new Set(ids).size).toBe(participants.length);
  }

  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Turnierübersicht ↗' }).click();
  const overview = await popupPromise;
  await overview.setViewportSize({ width: 1280, height: 720 });
  await expect(overview.locator('.projection-ranking tbody tr')).toHaveCount(participants.length);
  for (const summary of await overview.locator('.projector-history summary').all()) {
    await summary.click();
  }
  await expect
    .poll(() => overview.evaluate(() => document.documentElement.scrollHeight > innerHeight))
    .toBe(true);
  const ranking = overview.locator('.projection-ranking');
  await expect
    .poll(async () => (await ranking.boundingBox())?.height ?? Infinity)
    .toBeLessThanOrEqual(720);
  await overview.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await ranking.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => {
      const box = await ranking.boundingBox();
      return box ? box.y + box.height : Infinity;
    })
    .toBeLessThanOrEqual(720);
  const rankings = overview.locator('.projection-ranking .card');
  const withdrawals: string[] = [];
  const replacements: string[] = [];
  for (const ranking of await rankings.all()) {
    const rows = ranking.locator('tbody tr');
    const candidates = ranking.locator('tbody tr.projected-ko');
    const candidateCount = await candidates.count();
    expect(candidateCount).toBe(8);
    const selected = candidates.nth(randomIndex(candidateCount));
    await expect(selected).toHaveClass(/projected-ko/);
    await expect(rows.nth(8)).not.toHaveClass(/projected-ko|projected-tie/);
    withdrawals.push((await selected.locator('td').nth(1).innerText()).trim());
    replacements.push((await rows.nth(8).locator('td').nth(1).innerText()).trim());
  }
  testInfo.annotations.push({ type: 'withdrawals', description: withdrawals.join(', ') });

  for (const name of withdrawals) {
    await page.getByRole('button', { name: `${name} ändern`, exact: true }).click();
    await page.getByRole('checkbox', { name: `KO-Verzicht: ${name}`, exact: true }).check();
    await expect
      .poll(
        async () =>
          (await saved()).players.find((player: { name: string }) => player.name === name)
            .koExcluded,
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Bearbeitung schließen', exact: true }).click();
  }
  for (const name of replacements) {
    const row = overview
      .locator('.projection-ranking tbody tr')
      .filter({ has: overview.getByRole('cell', { name, exact: true }) });
    await expect(row).toHaveClass(/projected-ko/);
  }
  await overview.close();
  await page.getByRole('button', { name: 'Viertelfinale auslosen', exact: true }).click();
  for (const [round, title] of ['Viertelfinale', 'Halbfinale', 'Finale'].entries()) {
    if (round > 0)
      await page.getByRole('button', { name: `${title} auslosen`, exact: true }).click();
    await expect.poll(async () => (await saved()).ko.length).toBe(round + 1);
    const current = await saved();
    const actualIds = current.ko[round].flatMap((game: { teams: number[][] }) => game.teams.flat());
    const expectedIds =
      round === 0
        ? current.qualified
        : current.ko[round - 1].flatMap(
            (game: { teams: number[][] }, index: number) =>
              game.teams[knockoutResults[round - 1][index].winnerSide],
          );
    expect([...actualIds].sort((a, b) => a - b)).toEqual([...expectedIds].sort((a, b) => a - b));
    const section = page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: `${title} · Ergebnisse offen` }) });
    for (let game = 0; game < 4 / 2 ** round; game++) {
      const row = section.locator('tbody tr').nth(game);
      for (const [set, score] of knockoutResults[round][game].sets.entries()) {
        await enterSet(row, game + 1, set + 1, ...score);
        await expect.poll(async () => (await saved()).ko[round][game].sets.length).toBe(set + 1);
      }
    }
  }
  await expect(page.getByText(/^Turniersieg:/)).toBeVisible();
  const completed = await saved();
  for (const [round, games] of completed.group.entries()) {
    for (const [game, result] of games.entries()) {
      expect(result.sets).toEqual(groupResults[round][game]);
    }
  }
  expect(completed.qualified).toHaveLength(16);
  expect(completed.group).toHaveLength(5);
  const qualified = completed.players.filter((player: { id: number }) =>
    completed.qualified.includes(player.id),
  );
  expect(qualified.filter((player: { gender: string }) => player.gender === 'F')).toHaveLength(8);
  expect(qualified.filter((player: { gender: string }) => player.gender === 'M')).toHaveLength(8);
  for (const name of withdrawals) {
    expect(qualified.some((player: { name: string }) => player.name === name)).toBe(false);
  }
  for (const name of replacements) {
    expect(qualified.some((player: { name: string }) => player.name === name)).toBe(true);
  }
  expect(completed.ko.map((round: unknown[]) => round.length)).toEqual([4, 2, 1]);
  for (const [round, games] of completed.ko.entries()) {
    for (const [game, result] of games.entries()) {
      expect(result.sets).toEqual(knockoutResults[round][game].sets);
    }
  }
  await page.getByRole('button', { name: 'Datei schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Turnierdatei öffnen', exact: true }).click();
  await expect(page.getByText(/^Turniersieg:/)).toBeVisible();
  expect(await saved()).toEqual(completed);
  await expect(page.getByText(/Die Dateiverbindung konnte nicht gemerkt werden/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
