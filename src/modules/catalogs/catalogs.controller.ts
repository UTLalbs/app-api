import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";

import {getSatCatalog} from "./catalogs.service";
import type {SatCatalogKey} from "./constants/sat-catalogs.constants";

// ── GET /api/v1/catalogs/sat/:catalogKey ──────────────────────────────────

export const getSatCatalogHandler = asyncHandler(
	async (req: Request, res: Response) => {
		// El validator ya garantizó que catalogKey está en el whitelist.
		const catalogKey = String(req.params.catalogKey) as SatCatalogKey;
		const result = await getSatCatalog(catalogKey);
		res.json({success: true, data: result});
	},
);
