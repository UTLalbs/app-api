import type { ObjectId } from 'mongodb';

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface PositionDocument {
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

export interface Position {
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

export interface CreatePositionDto {
  orgId:     string;
  name:      string;
  key:       string;
  isSystem:  boolean;
  isActive:  boolean;
  createdBy: string;
}

export interface UpdatePositionDto {
  name?:     string;
  isActive?: boolean;
}

export interface PositionQueryFilter {
  isActive?: boolean;
  isSystem?: boolean;
}

// ── Seed ──────────────────────────────────────────────────────────────────

export interface PositionSeedItem {
  name: string;
  key:  string;
}
