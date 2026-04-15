import type { Request, Response } from "express";
import { getObject } from "../utils/getObject";
import { logInputs, setupEnv, useGasStation, nullSeed } from "./_common";

export default async function get_object(req: Request, res: Response) {
  try {
    const { network, objectId } = req.body;

    logInputs("get_object", { network, objectId });

    const { client } = await setupEnv(nullSeed, network);

    // NOTE: kept same invocation style as original (may be a higher-order function)
    const objectData = await getObject(client, objectId);

    res.json({ success: true, objectData });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
