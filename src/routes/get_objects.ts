import type { Request, Response } from "express";
import { searchObjectsByType } from "../utils/searchObjectByType";
import { logInputs, setupEnv, useGasStation, nullSeed } from "./_common";

export default async function get_objects(req: Request, res: Response) {
  try {
    const { network, after } = req.body;

    logInputs("get_objects", { network, after });

    const { graphqlProvider, OIDobjectType } = await setupEnv(nullSeed, network);

    const objectsList = await searchObjectsByType(OIDobjectType, after, graphqlProvider);

    console.log("objectType:", OIDobjectType);
    console.log("objectsList:", objectsList);

    res.json({ success: true, objectsList });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
