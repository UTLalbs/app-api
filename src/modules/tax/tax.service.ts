import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { HttpClient } from '../../infrastructure/http/httpClient';
import { AppError, NotFoundError } from '../../shared/errors/AppError';

import type {
  FacturoPorTiPostalResponse,
  FacturoPorTiRFCResponse,
  MappedAddress,
  PostalCodeResult,
  RFCValidationRequest,
  RFCValidationResult,
} from './tax.types';

// ── Cliente HTTP de FacturoPorTi ───────────────────────────────────────────

function getClient(): HttpClient {
  return new HttpClient({
    baseUrl: env.FACTUROPORTI_BASE_URL,
    headers: {
      Authorization: `Bearer ${env.FACTUROPORTI_TOKEN}`,
    },
    timeoutMs: 10_000,
  });
}

// ── Consultar código postal ────────────────────────────────────────────────

export async function getPostalCodeData(
  cp: string,
): Promise<PostalCodeResult[]> {
  logger.info({ cp }, 'Consulting postal code');

  const client = getClient();

  const raw = await client.get<FacturoPorTiPostalResponse[]>(
    `/catalogos/consulta/codigopostal?codigo=${cp}`,
  );

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new NotFoundError('Código postal no encontrado');
  }

  return raw.map((item) => ({
    claveColonia:   item.claveColonia,
    colonia:        item.colonia,
    claveLocalidad: item.claveLocalidad,
    localidad:      item.localidad,
    claveMunicipio: item.claveMunicipio,
    municipio:      item.municipio,
    claveEstado:    item.claveEstado,
    estado:         item.estado,
    codigoPostal:   item.codigoPostal,
  }));
}

// ── Validar RFC ────────────────────────────────────────────────────────────

export async function validateRFC(
  dto: RFCValidationRequest,
): Promise<RFCValidationResult>
{
  
  logger.info({ rfc: dto.rfc }, 'Validating RFC');

  const client = getClient();

  const body = [
    {
      rfc:               dto.rfc,
      nombreRazonSocial: dto.nombreRazonSocial,
      regimenFiscal:     dto.regimenFiscal ?? '',
      codigoPostal:      dto.codigoPostal,
    },
  ];

  const raw = await client.post<FacturoPorTiRFCResponse>(
    '/validar/rfc',
    body,
  );

  const result = raw.rfc?.[0];

  logger.info(
    { rfc: dto.rfc, esValido: result.esValido },
    'RFC validation complete',
  );

  if (!result) {
  throw new AppError(
    'Respuesta inesperada del servicio de validación',
    502,
    'EXTERNAL_SERVICE_ERROR',
  );
}

  logger.info(
  { rfc: dto.rfc, esValido: result.esValido },
  'RFC validation complete',
);

return {
  esValido:           result.esValido,
  estatus:            result.estatus,
  usosCFDIPermitidos: result.usosCFDIPermitidos ?? null,
};
}

// ── Helpers de mapeo ───────────────────────────────────────────────────────

export function mapPostalCodeToAddress(
  result: PostalCodeResult,
): MappedAddress {
  return {
    suburb:   { code: result.claveColonia,   name: result.colonia },
    location: { code: result.claveLocalidad, name: result.localidad },
    town:     { code: result.claveMunicipio, name: result.municipio },
    city:     { code: result.claveLocalidad, name: result.localidad },
    state:    { code: result.claveEstado,    name: result.estado },
    country:  { code: 'MEX',                name: 'México' },
    cp:       result.codigoPostal,
  };
}

export function getUsaAddressDefaults(
  state: string,
  stateCode: string,
  cp: string,
  reference?: string,
): MappedAddress {
  return {
    suburb:   { code: '0', name: 'N/A' },
    location: { code: '0', name: 'Localidad USA' },
    town:     { code: '0', name: 'Municipio USA' },
    city:     { code: '0', name: 'Localidad USA' },
    state:    { code: stateCode, name: state },
    country:  { code: 'USA', name: 'Estados Unidos' },
    cp,
    reference,
  };
}