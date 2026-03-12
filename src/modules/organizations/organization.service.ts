import { logger } from '../../config/logger';
import {
  cacheDel,
  getOrSet,
  CacheKeys,
  CacheTTL,
} from '../../infrastructure/cache/cache.service';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError';


import {
  findOrganizationById,
  findOrganizationBySlug,
  findAllOrganizations,
  createOrganization,
  updateOrganization,
  softDeleteOrganization,
} from './organization.repository';
import type { CreateOrganizationDto, Organization, UpdateOrganizationDto } from './organization.types';

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
): Promise<Organization> {
  const slug = dto.slug ?? generateSlug(dto.name);

  const existing = await findOrganizationBySlug(slug);
  if (existing) throw new ConflictError('Organization slug already exists');

  const org = await createOrganization({ ...dto, slug });

  await cacheDel(CacheKeys.orgList());

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