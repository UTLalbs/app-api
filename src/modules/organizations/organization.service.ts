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
import { computeDiff } from '../../shared/utils/diff';
import { generateSlug } from '../../shared/utils/slug';
import { emitAuditEvent } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { seedAbsenceCategoriesForOrg } from '../hr/absences/absence-category.seed';
import { initDepartmentCatalogForOrg } from '../hr/departments/department.service';
import { initDocumentCatalogForOrg } from '../hr/document-catalog/document-catalog.service';
import { initPositionCatalogForOrg } from '../hr/positions/position.service';
import { ensureOrgAdminRole } from '../roles/role.admin.service';


import {
  findOrganizationById,
  findOrganizationBySlug,
  findAllOrganizations,
  createOrganization,
  updateOrganization,
  softDeleteOrganization,
} from './organization.repository';
import type { CreateOrganizationDto, Organization, UpdateOrganizationDto } from './organization.types';

const ORG_UPDATABLE_FIELDS = [
  'name',
  'status',
  'settings',
  'fiscalData',
  'contacts',
] as const satisfies readonly (keyof UpdateOrganizationDto)[];


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
  context: AuditContext,
): Promise<Organization> {
  const slug = dto.slug ?? generateSlug(dto.name);

  const existing = await findOrganizationBySlug(slug);
  if (existing) throw new ConflictError('Organization slug already exists');

  const org = await createOrganization({ ...dto, slug });

  await cacheDel(CacheKeys.orgList());

  await ensureOrgAdminRole(org.id, org.settings.features);

  // Inicializar catálogos de RH — fire and forget (no bloquean el registro)
  initDocumentCatalogForOrg(org.id, actorId).catch((err) =>
    logger.error({ err, orgId: org.id }, 'Failed to seed document catalog'),
  );
  initPositionCatalogForOrg(org.id, actorId).catch((err) =>
    logger.error({ err, orgId: org.id }, 'Failed to seed position catalog'),
  );
  initDepartmentCatalogForOrg(org.id, actorId).catch((err) =>
    logger.error({ err, orgId: org.id }, 'Failed to seed department catalog'),
  );
  seedAbsenceCategoriesForOrg(org.id).catch((err) =>
    logger.error({ err, orgId: org.id }, 'Failed to seed absence categories'),
  );

  logger.info({ orgId: org.id, slug }, 'Organization registered');

  await emitAuditEvent({
    category: 'organizations',
    action: 'org_created',
    target: { type: 'organization', id: org.id, displayName: org.name },
    metadata: { slug: org.slug },
    context,
  });

  return org;
}

export async function editOrganization(
  id: string,
  dto: UpdateOrganizationDto,
  context: AuditContext,
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

  if (dto.settings?.features) {
    await ensureOrgAdminRole(id, updated.settings.features);
  }

  logger.info({ orgId: id }, 'Organization updated');

  const diff = computeDiff<UpdateOrganizationDto>(
    existing as unknown as Partial<UpdateOrganizationDto>,
    updated as unknown as Partial<UpdateOrganizationDto>,
    { allowedFields: ORG_UPDATABLE_FIELDS },
  );

  await emitAuditEvent({
    category: 'organizations',
    action: 'org_updated',
    target: { type: 'organization', id, displayName: updated.name },
    diff: diff ?? undefined,
    context,
  });

  return updated;
}

export async function removeOrganization(
  id: string,
  context: AuditContext,
): Promise<void> {
  const existing = await findOrganizationById(id);
  if (!existing) throw new NotFoundError('Organization');

  await softDeleteOrganization(id);

  await Promise.all([
    cacheDel(CacheKeys.orgOne(id)),
    cacheDel(CacheKeys.orgList()),
  ]);

  logger.info({ orgId: id }, 'Organization removed');

  await emitAuditEvent({
    category: 'organizations',
    action: 'org_deleted',
    target: { type: 'organization', id, displayName: existing.name },
    context,
  });
}