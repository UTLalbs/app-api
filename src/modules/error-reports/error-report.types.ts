import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type ErrorSeverity   = 'critical' | 'error' | 'warning' | 'info';
export type ErrorReportStatus = 'pending' | 'resolved' | 'ignored';
export type ErrorEnvironment  = 'development' | 'production';

// ── Subdocumentos ──────────────────────────────────────────────────────────

export interface ErrorReportItem {
  id:          string;
  code:        string;
  category:    string;
  severity:    ErrorSeverity;
  owner:       string;
  title:       string;
  message:     string;
  technical?:  string;
  entity?:     string;
  entityId?:   string;
  field?:      string;
  reportable:  boolean;
  timestamp:   Date;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface ErrorReportDocument {
  _id:         ObjectId;
  id:          string;
  timestamp:   Date;
  reportedBy:  string;
  orgId:       ObjectId | null;
  environment: ErrorEnvironment;
  entity:      string;
  entityId:    string;
  entityName:  string;
  errors:      ErrorReportItem[];
  userAgent:   string;
  url:         string;
  status:      ErrorReportStatus;
  createdAt:   Date;
  updatedAt:   Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface ErrorReport {
  id:          string;
  frontendId:  string;
  timestamp:   Date;
  reportedBy:  string;
  orgId:       string | null;
  environment: ErrorEnvironment;
  entity:      string;
  entityId:    string;
  entityName:  string;
  errors:      ErrorReportItem[];
  userAgent:   string;
  url:         string;
  status:      ErrorReportStatus;
  createdAt:   Date;
  updatedAt:   Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateErrorReportDto {
  id:          string;
  timestamp:   string;
  reportedBy:  string;
  orgId:       string | null;
  environment: ErrorEnvironment;
  entity:      string;
  entityId:    string;
  entityName:  string;
  errors:      ErrorReportItem[];
  userAgent:   string;
  url:         string;
}

export interface ErrorReportQueryFilter {
  status?:      ErrorReportStatus;
  environment?: ErrorEnvironment;
  page?:        number;
  limit?:       number;
}