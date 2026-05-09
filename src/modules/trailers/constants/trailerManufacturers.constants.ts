// Catálogo base de fabricantes de remolques. El usuario puede capturar marcas
// libres también; este catálogo solo facilita autocomplete y match con NHTSA.
//
// Sincronizado con `app-web/src/lib/utils/trailerManufacturers.ts` —
// SIEMPRE cambiar en pareja.

export interface TrailerManufacturerCatalogEntry {
	code: string;
	name: string;
	country: "US" | "MX" | "CA" | "OTHER";
	aliases?: string[];
}

export const TRAILER_MANUFACTURERS: TrailerManufacturerCatalogEntry[] = [
	// Estados Unidos
	{code: "WABASH", name: "Wabash National", country: "US", aliases: ["Wabash", "Wabash National Corp"]},
	{code: "GREATDANE", name: "Great Dane Trailers", country: "US", aliases: ["Great Dane"]},
	{code: "UTILITY", name: "Utility Trailer Manufacturing", country: "US", aliases: ["Utility", "UTILITY TRAILER MFG CO"]},
	{code: "HYUNDAI_TRANSLEAD", name: "Hyundai Translead", country: "US"},
	{code: "STOUGHTON", name: "Stoughton Trailers", country: "US", aliases: ["Stoughton"]},
	{code: "VANGUARD", name: "Vanguard National Trailer", country: "US"},
	{code: "STRICK", name: "Strick Trailers", country: "US"},
	{code: "TRAILMOBILE", name: "Trailmobile", country: "US"},
	{code: "HEIL", name: "Heil Trailer", country: "US"},
	{code: "POLAR", name: "Polar Tank Trailer", country: "US"},
	{code: "EAST_MFG", name: "East Manufacturing", country: "US"},
	{code: "FONTAINE", name: "Fontaine Trailer", country: "US"},
	{code: "KENTUCKY", name: "Kentucky Trailer", country: "US"},
	{code: "MANAC", name: "Manac", country: "US"},
	{code: "DOONAN", name: "Doonan", country: "US"},
	{code: "XL_SPECIALIZED", name: "XL Specialized Trailers", country: "US"},
	{code: "MAC", name: "Mac Trailer", country: "US"},
	{code: "REITNOUER", name: "Reitnouer", country: "US"},
	{code: "PITTS", name: "Pitts Enterprises", country: "US"},
	{code: "COTTRELL", name: "Cottrell", country: "US"},
	{code: "COZAD", name: "Cozad", country: "US"},
	{code: "TIMPTE", name: "Timpte", country: "US"},
	{code: "MERRITT", name: "Merritt Equipment", country: "US"},
	{code: "FRUEHAUF", name: "Fruehauf", country: "US", aliases: ["Fruehauf Trailer Corporation"]},
	// México
	{code: "LUFKIN_MX", name: "Lufkin de México", country: "MX", aliases: ["Lufkin"]},
	{code: "CIMSA", name: "CIMSA", country: "MX"},
	{code: "RINOR", name: "Rinor", country: "MX"},
	{code: "HERCULES_MX", name: "Hércules", country: "MX"},
	{code: "TRAILERS_MX", name: "Trailer's de México", country: "MX"},
	{code: "FURGO_MX", name: "Furgo de México", country: "MX"},
	{code: "OLIMPIA", name: "Olimpia", country: "MX"},
	{code: "IDEAL_MX", name: "Industrias IDEAL", country: "MX", aliases: ["IDEAL"]},
	{code: "FAYMONVILLE_MX", name: "Faymonville México", country: "MX"},
	{code: "REMEQUIPOS", name: "Remequipos", country: "MX"},
	// Canadá
	{code: "MANAC_CA", name: "Manac (Canada)", country: "CA"},
	// Genérico
	{code: "OTHER", name: "Otro / No listado", country: "OTHER"},
];

export const TRAILER_MANUFACTURER_CODES: ReadonlySet<string> = new Set(
	TRAILER_MANUFACTURERS.map((m) => m.code),
);

export function isTrailerManufacturerCode(code: string): boolean {
	return TRAILER_MANUFACTURER_CODES.has(code);
}

/** Match libre: por nombre exacto o cualquier alias (case-insensitive). */
export function findManufacturerByName(
	name: string,
): TrailerManufacturerCatalogEntry | undefined {
	const norm = name.trim().toUpperCase();
	return TRAILER_MANUFACTURERS.find((m) => {
		if (m.name.toUpperCase() === norm) return true;
		return (m.aliases ?? []).some((a) => a.toUpperCase() === norm);
	});
}
