// Marcas de suspensión típicas en flota MX/US/EU.
// Sincronizado con `app-web/src/lib/utils/unitSuspensionBrands.ts`.

export interface UnitSuspensionBrandEntry {
	code: string;
	name: string;
	country: "US" | "EU" | "OTHER";
}

const RAW_SUSPENSION_BRANDS: UnitSuspensionBrandEntry[] = [
	// Estados Unidos
	{code: "HENDRICKSON", name: "Hendrickson", country: "US"},
	{code: "REYCO_GRANNING", name: "Reyco Granning", country: "US"},
	{code: "RIDEWELL", name: "Ridewell", country: "US"},
	{code: "WATSON_CHALIN", name: "Watson & Chalin", country: "US"},
	{code: "HOLLAND", name: "Holland", country: "US"},
	{code: "NEWAY", name: "Neway", country: "US"},
	{code: "MERITOR", name: "Meritor", country: "US"},

	// Europa
	{code: "SAF_HOLLAND", name: "SAF-Holland", country: "EU"},
	{code: "BPW", name: "BPW", country: "EU"},
	{code: "JOST", name: "JOST", country: "EU"},
	{code: "ROR", name: "ROR (Meritor Europe)", country: "EU"},
];

const OTHER_ENTRY: UnitSuspensionBrandEntry = {
	code: "OTHER",
	name: "Otra / No listada",
	country: "OTHER",
};

export const UNIT_SUSPENSION_BRANDS: UnitSuspensionBrandEntry[] = [
	...RAW_SUSPENSION_BRANDS.slice().sort((a, b) =>
		a.name.localeCompare(b.name, "es", {sensitivity: "base"}),
	),
	OTHER_ENTRY,
];
