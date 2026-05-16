import type { Request, Response } from "express";
import axios from "axios";

const storageApiBaseUrl = String(process.env.STORAGE_API_BASE_URL || "https://api.storage.objectid.io/api").replace(/\/+$/, "");

export default async function delete_storage_file(req: Request, res: Response) {
  try {
    const { data, status } = await axios.delete(`${storageApiBaseUrl}/uploads/${encodeURIComponent(String(req.params.id))}`, {
      validateStatus: () => true,
    });
    res.status(status).json(data);
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}
