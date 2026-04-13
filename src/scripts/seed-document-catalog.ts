import { ObjectId } from 'mongodb';

import { getDb, connectDatabase } from '../config/database';
import { DOCUMENT_CATALOG_SEED } from '../modules/hr/document-catalog/document-catalog.seed';

const SYSTEM_USER_ID = '000000000000000000000000';

async function run(): Promise<void> {
  await connectDatabase();
  const db = getDb();

  // Obtener todas las orgs activas
  const orgs = await db
    .collection('organizations')
    .find({ deletedAt: null })
    .project({ _id: 1, name: 1 })
    .toArray();

  console.log(`Found ${orgs.length} organizations`);

  for (const org of orgs) {
    const orgId = org._id.toHexString();

    // Verificar si ya tiene catálogo
    const existing = await db
      .collection('document_catalog')
      .countDocuments({ orgId: new ObjectId(orgId) });

    if (existing > 0) {
      console.log(`⏭  Org ${org.name} already has ${existing} catalog items — skipping`);
      continue;
    }

    // Insertar seed
    const now = new Date();
    const docs = DOCUMENT_CATALOG_SEED.map((item) => ({
      orgId:      new ObjectId(orgId),
      name:       item.name,
      type:       item.type,
      category:   item.category,
      required:   item.required,
      hasExpiry:  item.hasExpiry,
      hasRenewal: item.hasRenewal,
      isSystem:   true,
      isActive:   false,
      createdBy:  new ObjectId(SYSTEM_USER_ID),
      createdAt:  now,
      updatedAt:  now,
    }));

    await db.collection('document_catalog').insertMany(docs);
    console.log(`✅  Org ${org.name} — ${docs.length} catalog items seeded`);
  }

  console.log('Done');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});