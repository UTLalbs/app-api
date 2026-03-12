import type { ObjectId } from 'mongodb';

// ── Documento en MongoDB ───────────────────────────────────────────────────
export interface OrganizationDocument {
  _id: ObjectId;
  name: string;
  slug: string;          // identificador único URL-friendly ej: "Unidos Transport"
  status: OrgStatus;
  settings: OrgSettings;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  settings: OrgSettings;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-tipos ──────────────────────────────────────────────────────────────
export type OrgStatus = 'active' | 'suspended' | 'trial';

export interface OrgSettings {
  allowedEmailDomains: string[];   // si está lleno, solo emails de estos dominios pueden unirse
  maxUsers: number;                // límite de usuarios por organización
}

// ── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateOrganizationDto {
  name: string;
  slug: string;
  settings?: Partial<OrgSettings>;
}

export interface UpdateOrganizationDto {
  name?: string;
  status?: OrgStatus;
  settings?: Partial<OrgSettings>;
}