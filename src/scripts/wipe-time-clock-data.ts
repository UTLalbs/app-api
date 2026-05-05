/* eslint-disable no-console */
//
// Wipe completo de la data de fichajes — DESTRUCTIVO.
// Borra TODOS los documentos de:
//   - time_clock_days
//   - time_clock_events
//   - schedule_assignments
//   - clock_review_sessions
//
// PRESERVA:
//   - users (con su workSchedule)
//   - schedule_templates
//   - locations
//   - absence_requests, absence_categories
//   - todo lo demás
//
// Útil para reiniciar pruebas con una BD limpia. Por default es dry-run.
// Pasa `--apply` para ejecutar.
//
// Uso:
//   pnpm wipe:tc           # dry-run
//   pnpm wipe:tc -- --apply # ejecuta el wipe
//
import { connectDatabase, getDb } from '../config/database';

const COLLECTIONS = [
  'time_clock_days',
  'time_clock_events',
  'schedule_assignments',
  'clock_review_sessions',
] as const;

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await connectDatabase();
  const db = getDb();

  console.log('Conteo actual:');
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) {
    const n = await db.collection(c).countDocuments({});
    counts[c] = n;
    console.log(`  ${c}: ${n}`);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('\n✅  No hay docs que borrar. Todo limpio.');
    process.exit(0);
  }

  if (!apply) {
    console.log(`\nTotal a borrar si aplicas: ${total} docs`);
    console.log('Dry-run completado. Pasa `--apply` para ejecutar el wipe.');
    process.exit(0);
  }

  console.log('\n🗑  Aplicando wipe...');
  for (const c of COLLECTIONS) {
    const result = await db.collection(c).deleteMany({});
    console.log(`  ${c}: ${result.deletedCount ?? 0} borrados`);
  }
  console.log('\n✅  Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
