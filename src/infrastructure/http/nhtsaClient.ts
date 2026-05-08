import {logger} from "../../config/logger";
import {HttpClient} from "./httpClient";

// ── Cliente HTTP para NHTSA vPIC ──────────────────────────────────────────
// Servicio público del DOT de Estados Unidos. No requiere API key.
// Endpoint: GET /api/vehicles/decodevinvalues/{VIN}?format=json
// Docs: https://vpic.nhtsa.dot.gov/api/

const BASE_URL = "https://vpic.nhtsa.dot.gov";

let cachedClient: HttpClient | null = null;

function getClient(): HttpClient {
	if (cachedClient) return cachedClient;
	cachedClient = new HttpClient({
		baseUrl: BASE_URL,
		// Timeout corto: si NHTSA no responde rápido, mejor devolver 'failed' al
		// usuario y dejar que capture manualmente.
		timeoutMs: 8_000,
	});
	return cachedClient;
}

// ── Tipos crudos NHTSA ─────────────────────────────────────────────────────

export interface NhtsaDecodeRawResult {
	Make: string;
	Manufacturer: string;
	Model: string;
	ModelYear: string;
	BodyClass: string;
	VehicleType: string;
	PlantCity: string;
	PlantState: string;
	PlantCountry: string;
	GVWR: string;
	ErrorCode: string;
	ErrorText: string;
	[k: string]: string;
}

export interface NhtsaDecodeRawResponse {
	Count: number;
	Message: string;
	SearchCriteria: string;
	Results: NhtsaDecodeRawResult[];
}

// ── Función pública ───────────────────────────────────────────────────────

/**
 * Decodifica un VIN contra NHTSA vPIC. Devuelve el payload crudo o lanza si
 * la red falla. El service de trailers maneja el throw y mapea a
 * `decodeStatus: 'failed'`.
 */
export async function decodeVinValues(
	vin: string,
): Promise<NhtsaDecodeRawResponse> {
	const safeVin = vin.toUpperCase().trim();
	logger.info({vin: safeVin}, "NHTSA: decoding VIN");
	return getClient().get<NhtsaDecodeRawResponse>(
		`/api/vehicles/decodevinvalues/${encodeURIComponent(safeVin)}?format=json`,
	);
}
