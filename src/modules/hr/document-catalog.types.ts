import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type DocumentCatalogCategory =
  | 'identification'
  | 'hiring'
  | 'fiscal'
  | 'medical'
  | 'license'
  | 'banking'
  | 'usa_ops'
  | 'other';

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface DocumentCatalogDocument {
  _id:        ObjectId;
  orgId:      ObjectId;
  name:       string;
  type:       string;
  category:   DocumentCatalogCategory;
  required:   boolean;
  hasExpiry:  boolean;
  hasRenewal: boolean;
  isSystem:   boolean;
  isActive:   boolean;
  createdBy:  ObjectId;
  createdAt:  Date;
  updatedAt:  Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface DocumentCatalog {
  id:         string;
  orgId:      string;
  name:       string;
  type:       string;
  category:   DocumentCatalogCategory;
  required:   boolean;
  hasExpiry:  boolean;
  hasRenewal: boolean;
  isSystem:   boolean;
  isActive:   boolean;
  createdBy:  string;
  createdAt:  Date;
  updatedAt:  Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateDocumentCatalogDto {
  orgId:      string;
  name:       string;
  type:       string;
  category:   DocumentCatalogCategory;
  required:   boolean;
  hasExpiry:  boolean;
  hasRenewal: boolean;
  isSystem:   boolean;
  isActive:   boolean;
  createdBy:  string;
}

export interface UpdateDocumentCatalogDto {
  name?:       string;
  category?:   DocumentCatalogCategory;
  required?:   boolean;
  hasExpiry?:  boolean;
  hasRenewal?: boolean;
  isActive?:   boolean;
}

export interface DocumentCatalogQueryFilter {
  category?: DocumentCatalogCategory;
  isActive?: boolean;
}

// ── Seed item ──────────────────────────────────────────────────────────────

export interface DocumentCatalogSeedItem {
  name:       string;
  type:       string;
  category:   DocumentCatalogCategory;
  required:   boolean;
  hasExpiry:  boolean;
  hasRenewal: boolean;
}