import assert from 'node:assert/strict';
import { BACKUP_FORMAT } from '../.tmp-test/tournament/backup.js';
import { draw } from '../.tmp-test/tournament/draw.js';
import {
  TournamentStore,
  scoreSet,
  standings,
  roundDone,
  winnerTeam,
  qualificationCount,
} from '../.tmp-test/tournament/index.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: () => {
    throw new Error('Browser storage must not be used');
  },
  setItem: () => {
    throw new Error('Browser storage must not be used');
  },
  removeItem: () => {
    throw new Error('Browser storage must not be used');
  },
};
globalThis.window = { addEventListener() {}, setInterval() {} };
globalThis.location = { hash: '' };

window.showSaveFilePicker = async () => ({
  createWritable: async () => ({ write: async () => {}, close: async () => {} }),
});
async function newStore() {
  const store = new TournamentStore();
  await store.linkBackupFile();
  return store;
}

async function openBackup(store, file) {
  window.showOpenFilePicker = async () => [
    {
      name: file.name,
      getFile: async () => file,
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    },
  ];
  await store.openTournamentFile();
}

const professionalStore = await newStore();
professionalStore.addPlayer('Professional', 'F', true);
professionalStore.addPlayer('Regular', 'M');
assert.deepEqual(
  professionalStore.state().players.map((p) => p.professional),
  [true, false],
);
const legacyState = structuredClone(professionalStore.state());
for (const player of legacyState.players) {
  player.skill = player.professional ? 'experienced' : 'developing';
  delete player.professional;
}
await openBackup(
  professionalStore,
  new File(
    [JSON.stringify({ format: 'mixed-doppelturnier', version: 1, state: legacyState })],
    'legacy.json',
  ),
);
assert.deepEqual(
  professionalStore.state().players.map((p) => p.professional),
  [true, false],
);
assert(professionalStore.state().players.every((p) => !('skill' in p)));

const freeGroup = await newStore();
for (let i = 0; i < 16; i++) freeGroup.addPlayer(`Person ${i}`, i < 8 ? 'F' : 'M');
const originalRandom = Math.random;
try {
  Math.random = () => 0;
  freeGroup.drawGroup();
} finally {
  Math.random = originalRandom;
}
const genderOf = (id) => freeGroup.state().players.find((p) => p.id === id).gender;
assert(
  freeGroup
    .state()
    .group[0].some((game) => game.teams.some(([a, b]) => genderOf(a) === genderOf(b))),
  'Same-category teams are allowed in the group stage even with equal category sizes',
);
for (const game of freeGroup.state().group[0])
  freeGroup.setResult('group', game.id, [
    [11, 5],
    [11, 5],
  ]);
freeGroup.qualifyFromRanking();
for (let i = 0; i < 3; i++) {
  if (i) freeGroup.drawKo();
  for (const game of freeGroup.state().ko[i]) {
    for (const [a, b] of game.teams)
      assert.notEqual(genderOf(a), genderOf(b), 'Knockout teams remain mixed');
    freeGroup.setResult('ko', game.id, [
      [11, 5],
      [11, 5],
      [11, 5],
    ]);
  }
}

// The final must split professionals even when that requires both teams to repeat.
const finalRegression = await newStore();
for (const [name, gender, professional] of [
  ['Anna', 'F', true],
  ['Bernd', 'M', true],
  ['Oliver', 'M', false],
  ['Ulrike', 'F', false],
  ['Extra A', 'F', false],
  ['Extra B', 'M', false],
])
  finalRegression.addPlayer(name, gender, professional);
const finalState = structuredClone(finalRegression.state());
const [anna, bernd, oliver, ulrike, extraA, extraB] = finalState.players.map((p) => p.id);
finalState.ko = [
  [
    {
      id: 100,
      teams: [
        [anna, bernd],
        [extraA, extraB],
      ],
      sets: [],
    },
  ],
  [
    {
      id: 101,
      teams: [
        [anna, oliver],
        [bernd, ulrike],
      ],
      sets: [],
    },
  ],
];
const finalGame = draw(finalState, [anna, bernd, oliver, ulrike], 'ko')[0];
assert.deepEqual(
  finalGame.teams.map(
    (team) => team.filter((id) => finalState.players.find((p) => p.id === id).professional).length,
  ),
  [1, 1],
  'A professional-only team should not face a team without professionals when avoidable',
);

for (const professionalCount of [1, 4]) {
  const balanced = await newStore();
  for (let i = 0; i < 16; i++)
    balanced.addPlayer(`Person ${i}`, i < 8 ? 'F' : 'M', i < professionalCount);
  balanced.drawGroup();
  for (const phase of ['group', 'ko']) {
    if (phase === 'ko') {
      for (const game of balanced.state().group[0])
        balanced.setResult('group', game.id, [
          [11, 5],
          [11, 5],
        ]);
      balanced.qualifyFromRanking();
    }
    const round = balanced.state()[phase][0];
    const mismatches = round.filter((game) => {
      const hasProfessional = (team) =>
        team.some((id) => balanced.state().players.find((p) => p.id === id).professional);
      return hasProfessional(game.teams[0]) !== hasProfessional(game.teams[1]);
    }).length;
    assert.equal(
      mismatches,
      professionalCount % 2,
      'Prefer professionals on both sides; an odd count remains allowed',
    );
  }
}

// A repeated encounter between professionals is preferable to two one-sided matches.
for (const phase of ['group', 'ko']) {
  const priorityState = {
    players: Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      name: `Participant ${index + 1}`,
      gender: index % 2 ? 'M' : 'F',
      professional: index < 2,
    })),
    group: [],
    ko: [],
    qualified: null,
    nextId: 100,
  };
  priorityState[phase] = Array.from({ length: 20 }, (_, index) => [
    {
      id: index + 1,
      teams: [
        [1, 3],
        [2, 4],
      ],
      sets: [],
    },
  ]);
  let seed = 42;
  let round;
  try {
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    round = draw(
      priorityState,
      priorityState.players.map((player) => player.id),
      phase,
    );
  } finally {
    Math.random = originalRandom;
  }
  const professionalGame = round.find((game) => game.teams.flat().includes(1));
  assert(
    professionalGame.teams.flat().includes(2),
    `${phase}: professional balance takes priority over repeated individual opponents`,
  );
  assert(
    professionalGame.teams.every((team) => team.filter((id) => id <= 2).length === 1),
    `${phase}: the two professionals play on opposite teams`,
  );
  assert.equal(new Set(round.flatMap((game) => game.teams.flat())).size, 8);
}

for (const allProfessional of [false, true]) {
  const tournament = await newStore();
  for (const gender of ['F', 'M']) {
    for (let i = 0; i < 8; i++)
      tournament.addPlayer(`${gender}${i}`, gender, allProfessional || i < 4);
  }
  const professionalPairs = (round) =>
    round
      .flatMap((game) => game.teams)
      .filter((team) =>
        team.every((id) => tournament.state().players.find((p) => p.id === id).professional),
      ).length;
  for (let i = 0; i < 3; i++) {
    tournament.drawGroup();
    const round = tournament.state().group.at(-1);
    assert.equal(
      professionalPairs(round),
      allProfessional ? 8 : 0,
      'Avoid professional-only teams but allow them when needed',
    );
    for (const game of round)
      tournament.setResult('group', game.id, [
        [11, 5],
        [11, 5],
      ]);
  }
  tournament.qualifyFromRanking();
  assert.equal(
    professionalPairs(tournament.state().ko[0]),
    allProfessional ? 8 : 0,
    'The professional preference also applies in knockout rounds',
  );
  for (let i = 0; i < 3; i++) {
    if (i) tournament.drawKo();
    const round = tournament.state().ko[i];
    assert.equal(round.length, [4, 2, 1][i]);
    if (allProfessional) assert.equal(professionalPairs(round), round.length * 2);
    for (const game of round)
      tournament.setResult('ko', game.id, [
        [11, 5],
        [11, 5],
        [11, 5],
      ]);
  }
}

assert.deepEqual(scoreSet(11, 5), [11, 5]);
assert.deepEqual(scoreSet(18, 16), [11, 9]);
assert.throws(() => scoreSet(11, 10));
assert.throws(() => scoreSet(12, 9));
const tieState = {
  players: [
    { id: 1, name: 'Zoe', gender: 'F' },
    { id: 2, name: 'Anna', gender: 'F' },
  ],
  group: [
    [
      {
        teams: [
          [1, 3],
          [5, 6],
        ],
        sets: [
          [11, 0],
          [11, 0],
        ],
      },
      {
        teams: [
          [2, 4],
          [7, 8],
        ],
        sets: [
          [11, 0],
          [3, 11],
        ],
      },
    ],
    [
      {
        teams: [
          [1, 3],
          [5, 6],
        ],
        sets: [
          [0, 11],
          [0, 11],
        ],
      },
      {
        teams: [
          [2, 4],
          [7, 8],
        ],
        sets: [
          [4, 11],
          [4, 11],
        ],
      },
    ],
  ],
};
const tieRanking = standings(tieState, 'F');
assert.deepEqual(
  tieRanking.map((p) => [p.name, p.points, p.setsWon]),
  [
    ['Zoe', 22, 2],
    ['Anna', 22, 1],
  ],
);
tieState.group[0][0].sets = [];
assert.equal(standings(tieState, 'F').find((p) => p.id === 1).setsWon, 0);

const store = await newStore();
const withdrawal = await newStore();
for (const gender of ['F', 'M'])
  for (let i = 0; i < 10; i++) withdrawal.addPlayer(`${gender}${i}`, gender);
withdrawal.drawGroup();
for (const game of withdrawal.state().group[0])
  withdrawal.setResult('group', game.id, [
    [11, 5],
    [11, 5],
  ]);
const withdrawn = standings(withdrawal.state(), 'F')[0];
withdrawal.setKoExcluded(withdrawn.id, true);
const expected = standings(withdrawal.state(), 'F')
  .filter((p) => !p.koExcluded)
  .slice(0, 8)
  .map((p) => p.id);
const selectedRest = standings(withdrawal.state(), 'M')
  .slice(0, 8)
  .map((p) => p.id);
assert.throws(
  () => withdrawal.qualify([withdrawn.id, ...expected.slice(0, 7), ...selectedRest]),
  /KO-Verzicht/,
);
withdrawal.qualify([...expected, ...selectedRest]);
assert(!withdrawal.state().qualified.includes(withdrawn.id));
assert(expected.every((id) => withdrawal.state().qualified.includes(id)));
assert.throws(() => withdrawal.setKoExcluded(withdrawn.id, false), /KO-Auslosung/);
withdrawal.deleteKoRound(0);
withdrawal.setKoExcluded(withdrawn.id, false);
assert.equal(withdrawal.state().players.find((p) => p.id === withdrawn.id).koExcluded, false);
for (let i = 1; i <= 24; i++) store.addPlayer(`Category F participant ${i}`, 'F');
for (let i = 1; i <= 24; i++) store.addPlayer(`Category M participant ${i}`, 'M');
assert(store.state().players.every((p) => p.professional === false));
store.setPlayerProfessional(store.state().players[0].id, true);
assert.equal(store.state().players[0].professional, true);

const seenTeams = new Set();
for (let roundIndex = 0; roundIndex < 5; roundIndex++) {
  store.drawGroup();
  assert.throws(() => store.qualify([]), /Ergebnisse/);
  const round = store.state().group.at(-1);
  assert.equal(round.length, 12);
  const ids = round.flatMap((g) => g.teams.flat());
  assert.equal(new Set(ids).size, 48, 'Each participant plays exactly once');
  for (const game of round) {
    for (const team of game.teams) {
      const key = [...team].sort((a, b) => a - b).join(':');
      assert(!seenTeams.has(key), 'Partners do not repeat with this participant count');
      seenTeams.add(key);
    }
  }
}

const calledGame = store.state().group[0][0].id;
store.setCalled('group', calledGame, true);
assert.equal(store.state().group[0][0].called, true);
store.setCalled('group', calledGame, false);
assert.equal(store.state().group[0][0].called, false);
store.setCalled('group', calledGame, true);
// Rounds may overlap. Older unfinished matches block qualification even when the latest round is complete.
for (const round of [...store.state().group].reverse()) {
  assert.throws(() => store.qualify([]), /Ergebnisse/);
  for (const game of round)
    store.setResult('group', game.id, [
      [11, 5],
      [18, 16],
    ]);
}
assert(store.state().group.every((round) => roundDone(round, 2)));
assert.equal(store.state().group[0][0].called, false);
assert.throws(() => store.setCalled('group', calledGame, true), /begonnenes Spiel/);

const selected = [
  ...standings(store.state(), 'F').slice(0, 8),
  ...standings(store.state(), 'M').slice(0, 8),
].map((p) => p.id);
store.qualify(selected);
assert.throws(() => store.drawGroup(), /Keine weitere/);
assert.equal(store.state().ko.length, 1);
store.deleteKoRound(0);
assert.equal(store.state().ko.length, 0);
assert.equal(store.state().qualified, null);
const recovered = await newStore();
assert.equal(recovered.state().qualified, null);
await openBackup(
  recovered,
  new File(
    [JSON.stringify({ format: BACKUP_FORMAT, version: 1, state: store.state() })],
    'tournament.json',
  ),
);
recovered.drawGroup();
assert.equal(recovered.state().group.length, 6);
store.qualify(selected);
for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
  if (roundIndex > 0) store.drawKo();
  const round = store.state().ko.at(-1);
  assert.equal(round.length, [4, 2, 1][roundIndex]);
  for (const game of round) {
    const wins = 3;
    store.setCalled('ko', game.id, true);
    const partial = [
      [11, 5],
      [5, 11],
    ];
    store.setResult('ko', game.id, partial);
    assert.equal(store.state().ko[roundIndex].find((g) => g.id === game.id).called, false);
    assert.throws(() => store.setCalled('ko', game.id, true), /begonnenes Spiel/);
    assert.equal(
      winnerTeam(
        store.state().ko[roundIndex].find((g) => g.id === game.id),
        wins,
      ),
      null,
    );
    assert.equal(roundDone(store.state().ko[roundIndex], wins, true), false);
    if (roundIndex < 2) assert.throws(() => store.drawKo(), /Ergebnisse/);
    store.setResult(
      'ko',
      game.id,
      Array.from({ length: wins }, () => [11, 5]),
    );
    assert.equal(store.state().ko[roundIndex].find((g) => g.id === game.id).called, false);
    assert.throws(() => store.deleteKoRound(roundIndex), /Ergebnissen/);
    assert.deepEqual(
      winnerTeam(
        store
          .state()
          .ko.at(-1)
          .find((g) => g.id === game.id),
      ),
      game.teams[0],
    );
  }
}
assert(roundDone(store.state().ko[2], 3));

const backup = new File(
  [JSON.stringify({ format: BACKUP_FORMAT, version: 1, state: store.state() })],
  'backup.json',
);
await openBackup(store, backup);
assert.equal(store.state().players.length, 48);
assert.equal(store.state().players[0].professional, true);
assert.equal(store.state().ko.length, 3);
assert.equal(store.state().group[0][0].called, false);

let savedJson = '';
window.showSaveFilePicker = async () => ({
  createWritable: async () => ({
    write: async (text) => {
      savedJson = text;
    },
    close: async () => {},
  }),
});
await store.linkBackupFile();
store.editPlayer(store.state().players[0].id, 'Replacement participant', 'F');
await store.flushFile();
assert.equal(JSON.parse(savedJson).state.players[0].name, 'Replacement participant');
assert.equal(JSON.parse(savedJson).format, BACKUP_FORMAT);
assert.equal(JSON.parse(savedJson).state.players[0].professional, true);
assert(!('profi' in JSON.parse(savedJson).state.players[0]));
assert.equal(store.linkedBackup(), true);

await assert.rejects(openBackup(store, new File(['{}'], 'invalid.json')));
assert.equal(store.state().players[0].name, 'Replacement participant');
storage.clear();
const deletion = await newStore();
for (let i = 0; i < 8; i++) {
  deletion.addPlayer(`F${i}`, 'F');
  deletion.addPlayer(`M${i}`, 'M');
}
deletion.drawGroup();
deletion.drawGroup();
assert.throws(() => deletion.qualifyFromRanking(), /Ergebnisse/);
deletion.setResult('group', deletion.state().group[0][0].id, [
  [11, 5],
  [11, 5],
]);
assert.throws(() => deletion.deleteGroupRound(0), /Ergebnissen/);
const gameToClear = deletion.state().group[0][0];
assert(
  ['F', 'M'].flatMap((g) => standings(deletion.state(), g)).some((player) => player.points > 0),
);
deletion.setResult('group', gameToClear.id, []);
assert.equal(deletion.state().group[0][0].sets.length, 0);
assert(
  ['F', 'M'].flatMap((g) => standings(deletion.state(), g)).every((player) => player.points === 0),
);
deletion.deleteGroupRound(1);
assert.equal(deletion.state().group.length, 1);
deletion.state.update((s) => ({
  ...s,
  group: Array.from({ length: 10 }, () => structuredClone(s.group[0])),
}));
assert.throws(() => deletion.drawGroup(), /höchstens 10/);
deletion.state.update((s) => ({ ...s, started: true, group: [s.group[0]] }));
deletion.deleteGroupRound(0);
deletion.addPlayer('New participant', 'F');
assert.throws(() => deletion.drawGroup(), /durch vier teilbar/);
storage.clear();
const automatic = await newStore();
for (let i = 0; i < 8; i++) {
  automatic.addPlayer(`F${i}`, 'F');
  automatic.addPlayer(`M${i}`, 'M');
}
automatic.drawGroup();
const partialGame = automatic.state().group[0][0];
automatic.setCalled('group', partialGame.id, true);
automatic.setResult('group', partialGame.id, [[11, 5]]);
assert.equal(automatic.state().group[0][0].called, false);
assert.throws(() => automatic.setCalled('group', partialGame.id, true), /begonnenes Spiel/);
assert.equal(roundDone(automatic.state().group[0], 2), false);
assert.equal(
  ['F', 'M']
    .flatMap((g) => standings(automatic.state(), g))
    .find((p) => partialGame.teams[0].includes(p.id)).points,
  11,
);
assert.throws(() => automatic.qualifyFromRanking(), /Ergebnisse/);
for (const game of automatic.state().group[0])
  automatic.setResult('group', game.id, [
    [11, 5],
    [11, 5],
  ]);
automatic.qualifyFromRanking();
assert.equal(automatic.state().qualified.length, 16);
assert.equal(automatic.state().ko.length, 1);
const bestOfFive = automatic.state().ko[0][0];
automatic.setResult('ko', bestOfFive.id, [
  [11, 5],
  [11, 5],
]);
assert.equal(
  winnerTeam(automatic.state().ko[0][0]),
  null,
  'A 2:0 lead is not a win in a best-of-five match',
);
automatic.setResult('ko', bestOfFive.id, [
  [11, 5],
  [11, 5],
  [5, 11],
  [5, 11],
  [5, 11],
]);
assert.deepEqual(
  winnerTeam(automatic.state().ko[0][0]),
  bestOfFive.teams[1],
  'A 2:3 score finishes the match',
);
assert.throws(
  () =>
    automatic.setResult('ko', bestOfFive.id, [
      [11, 5],
      [11, 5],
      [11, 5],
      [5, 11],
    ]),
  /entscheidenden Satz/,
);
assert.throws(
  () =>
    automatic.setResult(
      'ko',
      bestOfFive.id,
      Array.from({ length: 6 }, () => [11, 5]),
    ),
  /Gewinnsätze/,
);
for (const [women, men] of [
  [7, 17],
  [0, 24],
]) {
  storage.clear();
  const unequal = await newStore();
  for (let i = 0; i < women; i++) unequal.addPlayer(`F${i}`, 'F');
  for (let i = 0; i < men; i++) unequal.addPlayer(`M${i}`, 'M');
  unequal.drawGroup();
  for (const game of unequal.state().group[0])
    unequal.setResult('group', game.id, [
      [11, 5],
      [11, 5],
    ]);
  assert.equal(qualificationCount(unequal.state(), 'F'), women);
  assert.equal(qualificationCount(unequal.state(), 'M'), 16 - women);
  unequal.qualify(
    ['F', 'M'].flatMap((g) =>
      standings(unequal.state(), g)
        .slice(0, qualificationCount(unequal.state(), g))
        .map((p) => p.id),
    ),
  );
  for (let i = 0; i < 3; i++) {
    if (i > 0) unequal.drawKo();
    assert.equal(unequal.state().ko[i].length, [4, 2, 1][i]);
    for (const game of unequal.state().ko[i])
      unequal.setResult(
        'ko',
        game.id,
        Array.from({ length: 3 }, () => [11, 5]),
      );
  }
}
storage.clear();
const phaseHistory = await newStore();
phaseHistory.state.set({
  players: Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    gender: i % 2 ? 'M' : 'F',
  })),
  group: [
    [
      {
        id: 10,
        teams: [
          [1, 4],
          [3, 2],
        ],
        sets: [
          [11, 5],
          [11, 5],
        ],
      },
    ],
  ],
  ko: [
    [],
    [
      {
        id: 11,
        teams: [
          [1, 2],
          [5, 6],
        ],
        sets: [
          [11, 5],
          [11, 5],
          [11, 5],
        ],
      },
      {
        id: 12,
        teams: [
          [3, 4],
          [7, 8],
        ],
        sets: [
          [11, 5],
          [11, 5],
          [11, 5],
        ],
      },
    ],
  ],
  qualified: [1, 2, 3, 4],
  nextId: 20,
});
phaseHistory.drawKo();
const finalTeams = phaseHistory
  .state()
  .ko[2][0].teams.map((team) => [...team].sort().join(':'))
  .sort();
assert.deepEqual(
  finalTeams,
  ['1:4', '2:3'],
  'Group-stage pairings are unrestricted; semifinal pairings are avoided',
);
const locked = new TournamentStore();
assert.throws(() => locked.addPlayer('Without a file', 'F'), /Turnierdatei/);
let diskJson = '';
window.showOpenFilePicker = async () => [
  {
    getFile: async () =>
      new File(
        [JSON.stringify({ format: BACKUP_FORMAT, version: 1, state: store.state() })],
        'tournament.json',
      ),
    createWritable: async () => ({
      write: async (text) => {
        diskJson = text;
      },
      close: async () => {},
    }),
  },
];
storage.clear();
const reopened = new TournamentStore();
await reopened.openTournamentFile();
assert.equal(reopened.state().players.length, 48);
assert.equal(JSON.parse(diskJson).state.group.length, 5);
assert.deepEqual(JSON.parse(diskJson).state, reopened.state());
const beforeClose = diskJson;
await reopened.closeTournamentFile();
assert.equal(reopened.linkedBackup(), false);
assert.equal(reopened.fileName(), '');
assert.equal(reopened.state().players.length, 0);
assert.equal(diskJson, beforeClose, 'Closing does not change the saved tournament file');
assert.throws(() => reopened.addPlayer('Closed', 'F'), /Turnierdatei/);
await reopened.openTournamentFile();
assert.equal(reopened.state().players.length, 48);
let failWrite = false;
window.showSaveFilePicker = async () => ({
  createWritable: async () => {
    if (failWrite) throw new Error('Storage unavailable');
    return { write: async () => {}, close: async () => {} };
  },
});
const failing = await newStore();
failing.addPlayer('Previously saved', 'F');
await failing.flushFile();
failWrite = true;
failing.editPlayer(
  failing.state().players[0].id,
  'Not saved yet',
  failing.state().players[0].gender,
);
await assert.rejects(failing.flushFile(), /nicht gespeichert/);
assert.equal(failing.linkedBackup(), false);
assert.equal(failing.state().players[0].name, 'Not saved yet');
await assert.rejects(failing.closeTournamentFile(), /nicht gespeichert/);
assert.equal(
  failing.state().players[0].name,
  'Not saved yet',
  'Write failures must not discard data on close',
);
assert.throws(() => failing.deletePlayer(999), /Turnierdatei/);
failWrite = false;
await failing.linkBackupFile(true);
assert.equal(failing.state().players.length, 0);
assert.equal(failing.state().group.length, 0);
assert.equal(failing.state().ko.length, 0);
assert.equal(failing.state().qualified, null);
assert.equal(failing.state().nextId, 1);
failing.addPlayer('Preserved on cancellation', 'F');
await failing.flushFile();
window.showSaveFilePicker = async () => {
  throw new Error('Cancelled');
};
await assert.rejects(failing.linkBackupFile(true), /Cancelled/);
assert.equal(failing.state().players[0].name, 'Preserved on cancellation');
const liveMessages = [];
class TestChannel {
  postMessage(message) {
    liveMessages.push(message);
  }
}
globalThis.BroadcastChannel = TestChannel;
window.BroadcastChannel = TestChannel;
window.showSaveFilePicker = async () => ({
  createWritable: async () => ({ write: async () => {}, close: async () => {} }),
});
const broadcasting = await newStore();
broadcasting.addPlayer('Live', 'F');
await broadcasting.flushFile();
assert.equal(liveMessages.at(-1).type, 'state');
assert.equal(liveMessages.at(-1).state.players[0].name, 'Live');
assert.equal(liveMessages.at(-1).connected, true);
assert.equal(liveMessages.at(-1).fileName, 'Turnierdatei');
console.log(
  'Verified tournament rules, required file persistence, reopening without browser data storage, and write failures.',
);
