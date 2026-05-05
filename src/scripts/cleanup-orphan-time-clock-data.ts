/* eslint-disable no-console */
//
// Limpieza de datos huérfanos en las colecciones de fichaje.
//
// Detecta `userId`s referenciados en `schedule_assignments`, `time_clock_days`
// y `time_clock_events` que NO existen en la colección `users`. Esto puede
// pasar si un user fue borrado completamente (no soft-delete) mientras tenía
// schedule/days asociados.
//
// Por default es dry-run (solo reporta). Pasa `--apply` para borrar.
//
// Uso:
//   pnpm cleanup:tc-orphans            # dry-run
//   pnpm cleanup:tc-orphans -- --apply # ejecuta el borrado
//
import { ObjectId } from 'mongodb';

import { getDb, connectDatabase } from '../config/database';

const COLLECTIONS = [
  'schedule_assignments',
  'time_clock_days',
  'time_clock_events',
] as const;

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await connectDatabase();
  const db = getDb();

  // 1. Reunir todos los userIds en uso en las tres colecciones.
  // Nota: Mongo con apiStrict:true no permite `distinct`, usamos aggregate.
  const usedIds = new Set<string>();
  for (const coll of COLLECTIONS) {
    const groups = await db
      .collection(coll)
      .aggregate<{ _id: ObjectId | string | null }>([
        { $group: { _id: '$userId' } },
      ])
      .toArray();
    for (const g of groups) {
      if (!g._id) continue;
      const oid = g._id instanceof ObjectId ? g._id : new ObjectId(String(g._id));
      usedIds.add(oid.toHexString());
    }
  }

  console.log(`UserIds únicos encontrados en colecciones de fichaje: ${usedIds.size}`);

  // 2. Para cada userId, ver si existe en users (incluyendo soft-deleted).
  const orphans: string[] = [];
  for (const idHex of usedIds) {
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(idHex) }, { projection: { _id: 1 } });
    if (!user) orphans.push(idHex);
  }

  if (orphans.length === 0) {
    console.log('✅  No hay huérfanos. Todo limpio.');
    process.exit(0);
  }

  console.log(`\n⚠  ${orphans.length} userId(s) huérfano(s):`);
  for (const idHex of orphans) console.log(`   - ${idHex}`);

  // 3. Conteo por colección para cada huérfano.
  console.log('\nConteo por colección:');
  const counts: Record<string, Record<string, number>> = {};
  for (const idHex of orphans) {
    counts[idHex] = {};
    const oid = new ObjectId(idHex);
    for (const coll of COLLECTIONS) {
      const c = await db.collection(coll).countDocuments({ userId: oid });
      counts[idHex][coll] = c;
      console.log(`   ${idHex} · ${coll}: ${c}`);
    }
  }

  if (!apply) {
    console.log('\nDry-run completado. Pasa `--apply` para borrar estos documentos.');
    process.exit(0);
  }

  // 4. Borrado real.
  console.log('\n🗑  Aplicando borrado...');
  let totalDeleted = 0;
  for (const idHex of orphans) {
    const oid = new ObjectId(idHex);
    for (const coll of COLLECTIONS) {
      const result = await db.collection(coll).deleteMany({ userId: oid });
      totalDeleted += result.deletedCount ?? 0;
      console.log(
        `   ${idHex} · ${coll}: ${result.deletedCount ?? 0} borrados`,
      );
    }
  }

  console.log(`\n✅  Done. Total docs borrados: ${totalDeleted}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
