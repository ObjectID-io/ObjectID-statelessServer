import type { Request, Response } from "express";
import axios from "axios";

const storageApiBaseUrl = String(process.env.STORAGE_API_BASE_URL || "https://api.storage.objectid.io/api").replace(/\/+$/, "");
const storagePublicBaseUrl = storageApiBaseUrl.replace(/\/api$/, "");

export default async function get_storage_file(req: Request, res: Response) {
  try {
    const upstream = await axios.get(`${storagePublicBaseUrl}/uploads/${encodeURIComponent(String(req.params.id))}`, {
      responseType: "stream",
      validateStatus: () => true,
    });

    res.status(upstream.status);
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (value !== undefined) res.setHeader(key, value as string);
    }
    upstream.data.pipe(res);
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}
