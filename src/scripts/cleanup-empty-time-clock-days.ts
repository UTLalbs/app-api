/* eslint-disable no-console */
//
// Limpieza de `time_clock_days` que se materializaron solo por viewing
// (cuando listTimeClockDays/getMyClockStatus creaban Days pre-emptivamente
// aunque nadie hubiera fichaje'd ese día).
//
// Criterio: Day "vacío" = sin events + sin anomalies + status
// scheduled_no_clockin. Estos pueden borrarse sin perder información — el
// frontend ahora los reconstruye virtualmente desde el workSchedule.
//
// Days que se PRESERVAN (NO son borrados):
//   - Días con events (fichaje real o manual)
//   - Días con anomalías (resueltas o pendientes — necesitan trazabilidad)
//   - Días con status distinto a scheduled_no_clockin (in_progress,
//     completed, absence, completed_with_issues, no_schedule)
//
// Por default es dry-run. Pasa `--apply` para ejecutar el borrado.
//
// Uso:
//   pnpm cleanup:tc-empty           # dry-run
//   pnpm cleanup:tc-empty -- --apply # borrar
//
import { connectDatabase, getDb } from '../config/database';

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await connectDatabase();
  const db = getDb();

  // Day "trivialmente vacío": sin events, sin anomalies, sin service visits.
  // Estos son los que se crearon por materialize-on-view legacy. Días con
  // CUALQUIER anomalía (resuelta o pendiente) se preservan — son intención
  // del planner que clickeó la fila virtual para registrar una observación.
  const filter = {
    $expr: {
      $and: [
        { $eq: [{ $size: { $ifNull: ['$events', []] } }, 0] },
        { $eq: [{ $size: { $ifNull: ['$anomalies', []] } }, 0] },
        { $eq: [{ $size: { $ifNull: ['$serviceVisits', []] } }, 0] },
      ],
    },
  };

  const total = await db.collection('time_clock_days').countDocuments({});
  const candidates = await db.collection('time_clock_days').countDocuments(filter);

  console.log(`time_clock_days totales en BD: ${total}`);
  console.log(`Candidatos a borrar (vacíos): ${candidates}`);
  console.log(`Días preservados (con events, anomalies o status≠scheduled_no_clockin): ${total - candidates}\n`);

  if (candidates === 0) {
    console.log('✅  No hay Days vacíos que limpiar.');
    process.exit(0);
  }

  // Mostrar muestra del primero para validar
  const sample = await db
    .collection('time_clock_days')
    .findOne(filter, {
      projection: {
        _id: 1,
        userId: 1,
        workDate: 1,
        status: 1,
        'denormalizedRefs.userName': 1,
      },
    });
  if (sample) {
    console.log('Ejemplo de Day a borrar:');
    console.log(`   ${sample.denormalizedRefs?.userName ?? '—'} · ${sample.workDate?.toISOString().slice(0, 10) ?? '—'} · status=${sample.status}\n`);
  }

  if (!apply) {
    console.log('Dry-run completado. Pasa `--apply` para borrar.');
    process.exit(0);
  }

  console.log('🗑  Aplicando borrado...');
  const result = await db.collection('time_clock_days').deleteMany(filter);
  console.log(`\n✅  Done. ${result.deletedCount ?? 0} Days vacíos borrados.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
