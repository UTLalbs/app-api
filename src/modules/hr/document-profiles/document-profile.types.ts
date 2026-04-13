import type { ObjectId } from 'mongodb';

// ── Subdocumento ───────────────────────────────────────────────────────────

export interface DocumentTypeEntry {
  type:     string;
  required: boolean;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface DocumentProfileDocument {
  _id:           ObjectId;
  orgId:         ObjectId;
  name:          string;
  description:   string | null;
  documentTypes: DocumentTypeEntry[];  
  createdBy:     ObjectId;
  createdAt:     Date;
  updatedAt:     Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface DocumentProfile {
  id:            string;
  orgId:         string;
  name:          string;
  description:   string | null;
  documentTypes: DocumentTypeEntry[];  
  createdBy:     string;
  createdAt:     Date;
  updatedAt:     Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateDocumentProfileDto {
  orgId:         string;
  name:          string;
  description:   string | null;
  documentTypes: DocumentTypeEntry[];   
  createdBy:     string;
}

export interface UpdateDocumentProfileDto {
  name?:          string;
  description?:   string | null;
  documentTypes?: DocumentTypeEntry[];  
}