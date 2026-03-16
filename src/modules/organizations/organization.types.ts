import type { ObjectId } from 'mongodb';

// ── Subdocumentos ──────────────────────────────────────────────────────────

export interface OrganizationSettings {
  timezone: string;
  distanceUnit: 'km' | 'mi';
  currency: string[];
  gpsUpdateInterval: number;
  maxUsers: number;
  allowedEmailDomains: string[];
  features: {
    gps: boolean;
    invoicing: boolean;
    cartaPorte: boolean;
    fuelControl: boolean;
    payroll: boolean;
    vectorSearch: boolean;
  };
}

export interface OrganizationFiscalData {
  rfc: string;
  razonSocial: string;
  regimenFiscal: {
    code: string;
    name: string;
  };
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface OrganizationDocument {
  _id: ObjectId;
  name: string;
  slug: string;
  status: OrganizationStatus;
  settings: OrganizationSettings;
  fiscalData: OrganizationFiscalData | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  settings: OrganizationSettings;
  fiscalData: OrganizationFiscalData | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Enums ──────────────────────────────────────────────────────────────────

export type OrganizationStatus = 'active' | 'suspended' | 'cancelled';

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateOrganizationDto {
  name: string;
  slug?: string;
  settings?: Partial<OrganizationSettings>;
  fiscalData?: OrganizationFiscalData | null;
}

export interface UpdateOrganizationDto {
  name?: string;
  status?: OrganizationStatus;
  settings?: Partial<OrganizationSettings>;
  fiscalData?: OrganizationFiscalData | null;
}