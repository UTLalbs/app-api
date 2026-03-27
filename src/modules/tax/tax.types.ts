// ── Código Postal ──────────────────────────────────────────────────────────

export interface PostalCodeResult {
  claveColonia: string;
  colonia: string;
  claveLocalidad: string;
  localidad: string;
  claveMunicipio: string;
  municipio: string;
  claveEstado: string;
  estado: string;
  codigoPostal: string;
}

// ── Validación RFC ─────────────────────────────────────────────────────────

export interface RFCValidationRequest {
  rfc: string;
  nombreRazonSocial: string;
  regimenFiscal: string | null;
  codigoPostal: string;
}

export interface RFCValidationResult {
  esValido: boolean;
  estatus: string;
  usosCFDIPermitidos: string | null;
}

// ── Mapeo address ──────────────────────────────────────────────────────────
// Convierte respuesta de FacturoPorTi al formato de address del sistema

export interface MappedAddress {
  suburb:   { code: string; name: string };
  location: { code: string; name: string };
  town:     { code: string; name: string };
  city:     { code: string; name: string };
  state:    { code: string; name: string };
  country:  { code: string; name: string };
  cp: string;
  reference?: string;
}

// ── Respuestas de FacturoPorTi (raw) ──────────────────────────────────────

export interface FacturoPorTiPostalResponse {
  claveColonia: string;
  colonia: string;
  claveLocalidad: string;
  localidad: string;
  claveMunicipio: string;
  municipio: string;
  claveEstado: string;
  estado: string;
  codigoPostal: string;
}

export interface FacturoPorTiRFCItem {
  rfc: string;
  esValido: boolean;
  estatus: string;
  usosCFDIPermitidos: string | null;
}

export interface FacturoPorTiRFCResponse {
  rfc: FacturoPorTiRFCItem[];
  codigo: string;
  mensaje: string;
}