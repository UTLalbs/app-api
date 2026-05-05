/* eslint-disable no-console */
//
// Script one-shot para borrar el Day + Schedule de May 5 de Melissa que
// quedaron mal asociados por el bug de timezone (shift_end a las 18:19
// Mexico = 00:19 UTC del día siguiente, se asignó al UTC day equivocado).
//
// Tras el fix de timezone en recalculateDay, el shift_end se reasocia al
// día Mexico May 4 correctamente. Pero los registros huérfanos del May 5
// UTC siguen ahí — los limpiamos con este script.
//
import { ObjectId } from 'mongodb';

import { getDb, connectDatabase } from '../config/database';

const ORPHAN_DAY_ID = '69f9378ae7ef1e33f64bf079';
const ORPHAN_SCHEDULE_ID = '69f93311281ac82094363f7d';

async function run(): Promise<void> {
  await connectDatabase();
  const db = getDb();

  const dayRes = await db
    .collection('time_clock_days')
    .deleteOne({ _id: new ObjectId(ORPHAN_DAY_ID) });
  console.log(
    `time_clock_days · ${ORPHAN_DAY_ID}: ${dayRes.deletedCount ?? 0} borrado(s)`,
  );

  const schedRes = await db
    .collection('schedule_assignments')
    .deleteOne({ _id: new ObjectId(ORPHAN_SCHEDULE_ID) });
  console.log(
    `schedule_assignments · ${ORPHAN_SCHEDULE_ID}: ${schedRes.deletedCount ?? 0} borrado(s)`,
  );

  console.log('\n✅  Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
