import {z} from "zod";

import {SAT_CATALOG_KEYS} from "./constants/sat-catalogs.constants";

export const getSatCatalogSchema = z.object({
	params: z.object({
		catalogKey: z.enum(SAT_CATALOG_KEYS as unknown as [string, ...string[]]),
	}),
});

export type GetSatCatalogInput = z.infer<typeof getSatCatalogSchema>;
