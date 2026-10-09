// Datos fijos del módulo de entreno: levantamientos base, abreviaturas y benchmarks clásicos.

// Levantamientos con 1RM (los porcentajes del entreno se calculan sobre estos).
// "puros": nombres que cuentan como ese levantamiento para guardar récords.
// "padre": de qué levantamiento sacar el % si no tienes RM de este
// (ej. Hang Power Clean → Power Clean → Clean → Clean & Jerk).
export const LEVANTAMIENTOS = [
  { id: 'snatch', name: 'Snatch', puros: ['snatch', 'squat snatch', 'full snatch'] },
  { id: 'power-snatch', name: 'Power Snatch', puros: ['power snatch'], padre: 'snatch' },
  { id: 'hang-snatch', name: 'Hang Snatch', puros: ['hang snatch', 'hang squat snatch'], padre: 'snatch' },
  { id: 'hang-power-snatch', name: 'Hang Power Snatch', puros: ['hang power snatch'], padre: 'power-snatch' },
  { id: 'snatch-balance', name: 'Snatch Balance', puros: ['snatch balance'], padre: 'snatch' },
  { id: 'snatch-pull', name: 'Snatch Pull', puros: ['snatch pull', 'snatch high pull'], padre: 'snatch' },
  { id: 'snatch-deadlift', name: 'Snatch Deadlift', puros: ['snatch deadlift'], padre: 'snatch' },
  { id: 'clean-jerk', name: 'Clean & Jerk', puros: ['clean and jerk', 'clean & jerk', 'clean jerk', 'c&j'] },
  { id: 'clean', name: 'Clean', puros: ['clean', 'squat clean', 'full clean'], padre: 'clean-jerk' },
  { id: 'power-clean', name: 'Power Clean', puros: ['power clean'], padre: 'clean' },
  { id: 'hang-clean', name: 'Hang Clean', puros: ['hang clean', 'hang squat clean'], padre: 'clean' },
  { id: 'hang-power-clean', name: 'Hang Power Clean', puros: ['hang power clean'], padre: 'power-clean' },
  { id: 'clean-pull', name: 'Clean Pull', puros: ['clean pull', 'clean high pull'], padre: 'clean' },
  { id: 'clean-deadlift', name: 'Clean Deadlift', puros: ['clean deadlift'], padre: 'clean' },
  { id: 'jerk', name: 'Split Jerk', puros: ['jerk', 'split jerk'], padre: 'clean-jerk' },
  { id: 'push-jerk', name: 'Push Jerk', puros: ['push jerk', 'power jerk'], padre: 'jerk' },
  { id: 'push-press', name: 'Push Press', puros: ['push press'] },
  { id: 'press', name: 'Strict Press', puros: ['strict press', 'press', 'shoulder press', 'press militar', 'overhead press'] },
  { id: 'back-squat', name: 'Back Squat', puros: ['back squat', 'sentadilla trasera'] },
  { id: 'front-squat', name: 'Front Squat', puros: ['front squat', 'sentadilla frontal'] },
  { id: 'ohs', name: 'Overhead Squat', puros: ['overhead squat', 'ohs'] },
  { id: 'deadlift', name: 'Deadlift', puros: ['deadlift', 'peso muerto'] },
  { id: 'sumo-deadlift', name: 'Sumo Deadlift', puros: ['sumo deadlift'] },
  { id: 'bench', name: 'Bench Press', puros: ['bench press', 'press banca', 'press de banca'] },
  { id: 'thruster', name: 'Thruster', puros: ['thruster'] },
  { id: 'hip-thrust', name: 'Hip Thrust', puros: ['hip thrust'] },
];

// Abreviaturas típicas de CrossFit → nombre completo
export const ABREV = {
  rmu: 'Ring Muscle-up', bmu: 'Bar Muscle-up', mu: 'Muscle-up', t2b: 'Toes to Bar', ttb: 'Toes to Bar',
  c2b: 'Chest to Bar', hspu: 'Handstand Push-up', du: 'Double Unders', dus: 'Double Unders', kbs: 'Kettlebell Swing',
  wb: 'Wall Ball', wbs: 'Wall Ball', ohs: 'Overhead Squat', rdl: 'RDL', gtoh: 'Ground to Overhead',
  sdhp: 'Sumo Deadlift High Pull', hsw: 'Handstand Walk', ghd: 'GHD Sit-up', pu: 'Pull-up', 'c&j': 'Clean & Jerk',
};

// Palabras dentro de un nombre que se escriben siempre igual.
// OJO: DB = UNA mancuerna y DBs = DOS mancuernas (la entrenadora lo usa para diferenciarlos);
// lo mismo con KB / KBs. Por eso NO se juntan.
export const PALABRAS = {
  db: 'DB', dumbbell: 'DB', mancuerna: 'DB',
  dbs: 'DBs', dumbbells: 'DBs', mancuernas: 'DBs',
  kb: 'KB', kettlebell: 'KB', kbs: 'KBs', kettlebells: 'KBs',
  bb: 'Barbell',
};

// Para la clave interna: una o dos mancuernas / kettlebells
export const IMPLEMENTO = {
  db: 'db1', dumbbell: 'db1', mancuerna: 'db1',
  dbs: 'db2', dumbbells: 'db2', mancuernas: 'db2',
  kb: 'kb1', kettlebell: 'kb1', kbs: 'kb2', kettlebells: 'kb2',
};

// Benchmarks clásicos de CrossFit
export const BENCHMARKS = [
  { id: 'fran', name: 'Fran', tipo: 'fortime', desc: '21-15-9: Thrusters 43/30 kg + Pull-ups' },
  { id: 'grace', name: 'Grace', tipo: 'fortime', desc: '30 Clean & Jerk 61/43 kg' },
  { id: 'isabel', name: 'Isabel', tipo: 'fortime', desc: '30 Snatch 61/43 kg' },
  { id: 'diane', name: 'Diane', tipo: 'fortime', desc: '21-15-9: Deadlift 102/70 kg + HSPU' },
  { id: 'elizabeth', name: 'Elizabeth', tipo: 'fortime', desc: '21-15-9: Squat Clean 61/43 kg + Ring Dips' },
  { id: 'helen', name: 'Helen', tipo: 'fortime', desc: '3 rondas: 400 m run, 21 KB swings 24/16 kg, 12 Pull-ups' },
  { id: 'jackie', name: 'Jackie', tipo: 'fortime', desc: '1000 m row, 50 Thrusters 20/15 kg, 30 Pull-ups' },
  { id: 'karen', name: 'Karen', tipo: 'fortime', desc: '150 Wall Balls 9/6 kg' },
  { id: 'annie', name: 'Annie', tipo: 'fortime', desc: '50-40-30-20-10: Double Unders + Sit-ups' },
  { id: 'nancy', name: 'Nancy', tipo: 'fortime', desc: '5 rondas: 400 m run + 15 OHS 43/30 kg' },
  { id: 'dt', name: 'DT', tipo: 'fortime', desc: '5 rondas: 12 Deadlift, 9 Hang Power Clean, 6 Push Jerk 70/47 kg' },
  { id: 'cindy', name: 'Cindy', tipo: 'amrap', desc: 'AMRAP 20 min: 5 Pull-ups, 10 Push-ups, 15 Air Squats' },
  { id: 'mary', name: 'Mary', tipo: 'amrap', desc: 'AMRAP 20 min: 5 HSPU, 10 Pistols, 15 Pull-ups' },
  { id: 'murph', name: 'Murph', tipo: 'fortime', desc: '1 milla run, 100 Pull-ups, 200 Push-ups, 300 Squats, 1 milla run (con chaleco 9/6 kg)' },
  { id: 'fgb', name: 'Fight Gone Bad', tipo: 'amrap', desc: '3 rondas de 1 min: Wall Ball, SDHP, Box Jump, Push Press, Row (cal) + 1 min descanso' },
];
