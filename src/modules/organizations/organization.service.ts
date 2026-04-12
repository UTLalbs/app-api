import { logger } from '../../config/logger';
import {
  cacheDel,
  cacheGet,
  cacheSet,
  getOrSet,
  CacheKeys,
  CacheTTL,
} from '../../infrastructure/cache/cache.service';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError';
import { initDocumentCatalogForOrg } from '../hr/document-catalog/document-catalog.service';


import {
  findOrganizationById,
  findOrganizationBySlug,
  findAllOrganizations,
  createOrganization,
  updateOrganization,
  softDeleteOrganization,
} from './organization.repository';
import type { CreateOrganizationDto, Organization, UpdateOrganizationDto } from './organization.types';


// ── Helper timezone ────────────────────────────────────────────────────────

const DEFAULT_TIMEZONE = 'America/Mexico_City';

export async function getOrgTimezone(orgId: string): Promise<string> {
  const cacheKey = CacheKeys.orgTimezone(orgId);

  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  const org = await findOrganizationById(orgId);
  const timezone = org?.settings.timezone ?? DEFAULT_TIMEZONE;

  await cacheSet(cacheKey, timezone, CacheTTL.MEDIUM);

  return timezone;
}

// ── Utilidad — genera slug a partir del nombre ─────────────────────────────
// "Unidos Transport" → "unidos-transport"
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')                    // descompone caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '')     // elimina los diacríticos (tildes)
    .replace(/[^a-z0-9\s-]/g, '')        // elimina caracteres especiales
    .replace(/\s+/g, '-')               // espacios → guiones
    .replace(/-+/g, '-');               // múltiples guiones → uno solo
}

// ── Consultas ──────────────────────────────────────────────────────────────

export async function getOrganizationById(id: string): Promise<Organization> {
  const org = await getOrSet(
    CacheKeys.orgOne(id),
    () => findOrganizationById(id),
    CacheTTL.LONG,
  );

  if (!org) throw new NotFoundError('Organization');

  return org;
}

export async function listOrganizations(): Promise<Organization[]> {
  return getOrSet(
    CacheKeys.orgList(),
    () => findAllOrganizations(),
    CacheTTL.MEDIUM,
  );
}

export async function registerOrganization(
  dto: CreateOrganizationDto,
  actorId: string,
): Promise<Organization> {
  const slug = dto.slug ?? generateSlug(dto.name);

  const existing = await findOrganizationBySlug(slug);
  if (existing) throw new ConflictError('Organization slug already exists');

  const org = await createOrganization({ ...dto, slug });

  await cacheDel(CacheKeys.orgList());

  // Inicializar catálogo de documentos — fire and forget
  initDocumentCatalogForOrg(org.id, actorId).catch((err) =>
    logger.error({ err, orgId: org.id }, 'Failed to seed document catalog'),
  );

  logger.info({ orgId: org.id, slug }, 'Organization registered');

  return org;
}

export async function editOrganization(
  id: string,
  dto: UpdateOrganizationDto,
): Promise<Organization> {
  const existing = await findOrganizationById(id);
  if (!existing) throw new NotFoundError('Organization');

  const updated = await updateOrganization(id, dto);

  await Promise.all([
    cacheDel(CacheKeys.orgOne(id)),
    cacheDel(CacheKeys.orgList()),
    // Invalidar timezone si cambió settings
    dto.settings?.timezone ? cacheDel(CacheKeys.orgTimezone(id)) : Promise.resolve(),
  ]);

  logger.info({ orgId: id }, 'Organization updated');

  return updated;
}

export async function removeOrganization(id: string): Promise<void> {
  const existing = await findOrganizationById(id);
  if (!existing) throw new NotFoundError('Organization');

  await softDeleteOrganization(id);

  await Promise.all([
    cacheDel(CacheKeys.orgOne(id)),
    cacheDel(CacheKeys.orgList()),
  ]);

  logger.info({ orgId: id }, 'Organization removed');
}