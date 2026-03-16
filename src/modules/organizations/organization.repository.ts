import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';

import { getOrganizationCollection } from './organization.model';
import type {
  CreateOrganizationDto,
  Organization,
  OrganizationDocument,
  UpdateOrganizationDto,
} from './organization.types';

// ── Conversión de documento MongoDB a tipo de dominio ─────────────────────
function toOrganization(doc: OrganizationDocument): Organization {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    status: doc.status,
    settings: doc.settings,
    fiscalData: doc.fiscalData ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Métodos del repository ─────────────────────────────────────────────────

export async function findOrganizationById(id: string): Promise<Organization | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getOrganizationCollection().findOne<OrganizationDocument>({
    _id: new ObjectId(id),
    deletedAt: null,
  });

  return doc ? toOrganization(doc) : null;
}

export async function findOrganizationBySlug(slug: string): Promise<Organization | null> {
  const doc = await getOrganizationCollection().findOne<OrganizationDocument>({
    slug: slug.toLowerCase(),
    deletedAt: null,
  });

  return doc ? toOrganization(doc) : null;
}

export async function findAllOrganizations(): Promise<Organization[]> {
  const docs = await getOrganizationCollection()
    .find<OrganizationDocument>({ deletedAt: null })
    .toArray();

  return docs.map(toOrganization);
}

export async function createOrganization(
  dto: CreateOrganizationDto,
): Promise<Organization> {
  const now = new Date();

  const doc: Omit<OrganizationDocument, '_id'> = {
    name: dto.name.trim(),
    slug: dto.slug.toLowerCase().trim(),
    status: 'active', // Valor por defecto al crear una organización
    fiscalData: dto.fiscalData ?? null,
    settings: {
    timezone: 'America/Mexico_City',
    distanceUnit: 'km',
    currency: ['MXN'],
    gpsUpdateInterval: 30,
    maxUsers: dto.settings?.maxUsers ?? 10,
    allowedEmailDomains: dto.settings?.allowedEmailDomains ?? [],
    features: {
      gps: false,
      invoicing: false,
      cartaPorte: false,
      fuelControl: false,
      payroll: false,
      vectorSearch: false,
      ...dto.settings?.features,
    },
  },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  try {
    const result = await getOrganizationCollection().insertOne(
      doc as OrganizationDocument,
    );

    logger.info(
      { orgId: result.insertedId.toHexString(), slug: doc.slug },
      'Organization created',
    );

    return toOrganization({ _id: result.insertedId, ...doc } as OrganizationDocument);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError(`Slug "${dto.slug}" is already taken`);
    }
    throw err;
  }
}

export async function updateOrganization(
  id: string,
  dto: UpdateOrganizationDto,
): Promise<Organization> {
  if (!ObjectId.isValid(id)) throw new NotFoundError('Organization');

  // Construir $set dinámicamente para no sobreescribir settings completos
  // si solo se actualiza una propiedad de settings
  const setFields: Record<string, unknown> = { updatedAt: new Date() };

  if (dto.name) setFields['name'] = dto.name.trim();
  if (dto.status) setFields['status'] = dto.status;
  if (dto.settings?.allowedEmailDomains !== undefined) {
    setFields['settings.allowedEmailDomains'] = dto.settings.allowedEmailDomains;
  }
  if (dto.settings?.maxUsers !== undefined) {
    setFields['settings.maxUsers'] = dto.settings.maxUsers;
  }

  const result = await getOrganizationCollection().findOneAndUpdate(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  if (!result) throw new NotFoundError('Organization');

  return toOrganization(result as OrganizationDocument);
}

export async function softDeleteOrganization(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new NotFoundError('Organization');

  const result = await getOrganizationCollection().updateOne(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: { deletedAt: new Date(), updatedAt: new Date() } },
  );

  if (result.matchedCount === 0) throw new NotFoundError('Organization');

  logger.info({ orgId: id }, 'Organization soft deleted');
}