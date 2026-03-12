import { logger } from '../../config/logger';
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
  const org = await findOrganizationById(id);

  if (!org) throw new NotFoundError('Organization');

  return org;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization> {
  const org = await findOrganizationBySlug(slug);

  if (!org) throw new NotFoundError('Organization');

  return org;
}

export async function listOrganizations(): Promise<Organization[]> {
  return findAllOrganizations();
}

// ── Creación ───────────────────────────────────────────────────────────────

export async function registerOrganization(
  dto: CreateOrganizationDto,
): Promise<Organization> {
  // Generar slug si no viene en el DTO
  const slug = dto.slug ?? generateSlug(dto.name);

  // Regla: el slug debe ser único
  const existing = await findOrganizationBySlug(slug);
  if (existing) {
    throw new ConflictError(`Slug "${slug}" is already taken`);
  }

  const org = await createOrganization({ ...dto, slug });

  logger.info({ orgId: org.id, slug: org.slug }, 'Organization registered');

  return org;
}

// ── Actualización ──────────────────────────────────────────────────────────

export async function editOrganization(
  id: string,
  dto: UpdateOrganizationDto,
): Promise<Organization> {
  const existing = await findOrganizationById(id);
  if (!existing) throw new NotFoundError('Organization');

  const updated = await updateOrganization(id, dto);

  logger.info({ orgId: id }, 'Organization updated');

  return updated;
}

// ── Eliminación ────────────────────────────────────────────────────────────

export async function removeOrganization(id: string): Promise<void> {
  const existing = await findOrganizationById(id);
  if (!existing) throw new NotFoundError('Organization');

  await softDeleteOrganization(id);

  logger.info({ orgId: id }, 'Organization removed');
}