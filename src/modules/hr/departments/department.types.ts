import type { ObjectId } from 'mongodb';

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface DepartmentDocument {
  _id:       ObjectId;
  orgId:     ObjectId;
  name:      string;
  key:       string;           // snake_case identifier, único por org
  isSystem:  boolean;          // true = pre-definido por seed, no se puede borrar
  isActive:  boolean;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Department {
  id:        string;
  orgId:     string;
  name:      string;
  key:       string;
  isSystem:  boolean;
  isActive:  boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateDepartmentDto {
  orgId:     string;
  name:      string;
  key:       string;
  isSystem:  boolean;
  isActive:  boolean;
  createdBy: string;
}

export interface UpdateDepartmentDto {
  name?:     string;
  isActive?: boolean;
}

export interface DepartmentQueryFilter {
  isActive?: boolean;
  isSystem?: boolean;
}

// ── Seed ──────────────────────────────────────────────────────────────────

export interface DepartmentSeedItem {
  name: string;
  key:  string;
}
