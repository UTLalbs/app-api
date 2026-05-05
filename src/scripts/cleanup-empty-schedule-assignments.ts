/* eslint-disable no-console */
//
// Limpieza de `schedule_assignments` materializados pero vacíos —
// residuos de cuando listTimeClockDays/getMyClockStatus materializaba
// pre-emptivamente al ver la página.
//
// Un Assignment es "vacío" si:
//   - No tiene events asociados (nadie ha fichado en ese (userId, workDate))
//   - No es cobertura (isCoverageOf / isCoveredBy null)
//   - No tiene notas
//   - status === 'draft' (los `published` son intencionales)
//
// Tras este cleanup, el calendario los muestra como **virtuales** (línea
// punteada), derivados del workSchedule. Solo persisten los Assignments
// reales: con events, cobertura, notas, o publicados.
//
// Por default es dry-run. Pasa `--apply` para borrar.
//
// Uso:
//   pnpm cleanup:tc-assignments           # dry-run
//   pnpm cleanup:tc-assignments -- --apply # borrar
//
import { ObjectId } from 'mongodb';

import { connectDatabase, getDb } from '../config/database';

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await connectDatabase();
  const db = getDb();

  const total = await db
    .collection('schedule_assignments')
    .countDocuments({ deletedAt: null });

  // Encontrar Assignments candidatos: status draft, sin coverage, sin notes.
  const candidatesAgg = await db
    .collection('schedule_assignments')
    .aggregate([
      {
        $match: {
          deletedAt: null,
          status: 'draft',
          isCoverageOf: null,
          isCoveredBy: null,
          $or: [{ notes: null }, { notes: '' }],
        },
      },
      // Lookup de events para descartar los que SÍ tienen fichajes
      {
        $lookup: {
          from: 'time_clock_events',
          let: { userId: '$userId', workDate: '$workDate' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', '$$userId'] },
                    { $gte: ['$clockedAt', '$$workDate'] },
                    {
                      $lt: [
                        '$clockedAt',
                        {
                          $dateAdd: {
                            startDate: '$$workDate',
                            unit: 'day',
                            amount: 2,
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'events',
        },
      },
      { $match: { events: { $size: 0 } } },
      { $project: { _id: 1, userId: 1, workDate: 1, denormalizedRefs: 1 } },
    ])
    .toArray();

  console.log(`schedule_assignments en BD (no borrados): ${total}`);
  console.log(`Candidatos a borrar (sin events ni overrides): ${candidatesAgg.length}`);
  console.log(`Días preservados (con events, coverage, notes o published): ${total - candidatesAgg.length}\n`);

  if (candidatesAgg.length === 0) {
    console.log('✅  No hay Assignments vacíos que limpiar.');
    process.exit(0);
  }

  // Mostrar muestra
  const sample = candidatesAgg.slice(0, 3);
  console.log('Ejemplos:');
  for (const a of sample) {
    const date = (a.workDate as Date).toISOString().slice(0, 10);
    const name =
      (a.denormalizedRefs as { userName?: string } | undefined)?.userName ??
      a.userId.toString();
    console.log(`   ${name} · ${date}`);
  }
  if (candidatesAgg.length > 3) {
    console.log(`   ...y ${candidatesAgg.length - 3} más`);
  }
  console.log();

  if (!apply) {
    console.log('Dry-run completado. Pasa `--apply` para borrar.');
    process.exit(0);
  }

  console.log('🗑  Aplicando borrado...');
  const ids = candidatesAgg.map((c) => c._id as ObjectId);
  const result = await db
    .collection('schedule_assignments')
    .deleteMany({ _id: { $in: ids } });
  console.log(`\n✅  Done. ${result.deletedCount ?? 0} Assignments vacíos borrados.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
