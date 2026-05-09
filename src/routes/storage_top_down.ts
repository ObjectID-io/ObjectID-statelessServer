import type { Request, Response } from "express";

export default async function storage_top_down(_req: Request, res: Response) {
  res.status(501).json({
    success: false,
    error: "Storage top-down is not exposed by the current storage Move package. Use /storage/delete to delete the oracle task and refund its remaining IOTA balance.",
  });
}
