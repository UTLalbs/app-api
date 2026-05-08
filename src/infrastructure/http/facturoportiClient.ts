import {env} from "../../config/env";
import {HttpClient} from "./httpClient";

// ── Respuestas crudas de FacturoPorTi ──────────────────────────────────────

export interface FacturoPortiPostalEntry {
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

export interface FacturoPortiRfcRequestItem {
	rfc: string;
	nombreRazonSocial: string;
	regimenFiscal: string;
	codigoPostal: string;
}

export interface FacturoPortiRfcResponseItem {
	rfc: string;
	esValido: boolean;
	estatus: string;
	usosCFDIPermitidos: string | null;
}

export interface FacturoPortiRfcResponse {
	rfc: FacturoPortiRfcResponseItem[];
	codigo: string;
	mensaje: string;
}

/**
 * Shape real que devuelve `POST /catalogos/consultar`. Cada catálogo tiene
 * `codigo` (string) + `descripcion` (string) + 5 campos auxiliares opcionales
 * (`campo1`..`campo5`) que vienen como `string | null`.
 *
 * Para `c_RegimenFiscal` (clave 8) por ejemplo:
 *   campo1 = "Aplica a personas físicas"
 *   campo2 = "Aplica a personas morales"
 *
 * Se conservan tal cual por si en el futuro algún catálogo necesita más
 * que el code+description.
 */
export interface FacturoPortiCatalogEntry {
	codigo: string;
	descripcion: string;
	campo1: string | null;
	campo2: string | null;
	campo3: string | null;
	campo4: string | null;
	campo5: string | null;
}

// ── URL dinámica según NODE_ENV ────────────────────────────────────────────
// Reglas:
//   - production → https://api.facturoporti.com.mx
//   - development / staging / cualquier otro → https://testapi.facturoporti.com.mx
//
// `FACTUROPORTI_BASE_URL` en .env puede sobrescribir el default (útil para
// apuntar dev contra prod o viceversa puntualmente).

const PROD_BASE_URL = "https://api.facturoporti.com.mx";
const TEST_BASE_URL = "https://testapi.facturoporti.com.mx";

function resolveBaseUrl(): string {
	if (env.FACTUROPORTI_BASE_URL) return env.FACTUROPORTI_BASE_URL;
	return env.NODE_ENV === "production" ? PROD_BASE_URL : TEST_BASE_URL;
}

// ── Cliente HTTP de FacturoPorTi ───────────────────────────────────────────
// Wrapper de bajo nivel sobre HttpClient. Solo conoce los endpoints crudos
// del proveedor; no hace mapeo a los tipos del dominio.

let cachedClient: HttpClient | null = null;

function getClient(): HttpClient {
	if (cachedClient) return cachedClient;
	cachedClient = new HttpClient({
		baseUrl: resolveBaseUrl(),
		headers: {
			Authorization: `Bearer ${env.FACTUROPORTI_TOKEN}`,
		},
		timeoutMs: 10_000,
	});
	return cachedClient;
}

export async function getPostalCodeRaw(
	cp: string,
): Promise<FacturoPortiPostalEntry[]> {
	const raw = await getClient().get<FacturoPortiPostalEntry[]>(
		`/catalogos/consulta/codigopostal?codigo=${cp}`,
	);
	return Array.isArray(raw) ? raw : [];
}

export async function validateRfcRaw(
	payload: FacturoPortiRfcRequestItem,
): Promise<FacturoPortiRfcResponse> {
	return getClient().post<FacturoPortiRfcResponse>("/validar/rfc", [payload]);
}

/**
 * Consulta un catálogo del SAT. Endpoint real:
 *   POST /catalogos/consultar
 *   body: { ClaveCatalogo: <numero> }     ← PascalCase, no camelCase
 *
 * Devuelve un arreglo `[{codigo, descripcion, campo1..5}]`.
 */
export async function getCatalogRaw(
	claveNumerica: number,
): Promise<FacturoPortiCatalogEntry[]> {
	const raw = await getClient().post<FacturoPortiCatalogEntry[]>(
		"/catalogos/consultar",
		{ClaveCatalogo: claveNumerica},
	);
	return Array.isArray(raw) ? raw : [];
}
