import type { Request, Response } from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";

const maxUploadBytes = Number(process.env.STORAGE_MAX_UPLOAD_BYTES || "52428800");
const storageApiBaseUrl = String(process.env.STORAGE_API_BASE_URL || "https://api.storage.objectid.io/api").replace(/\/+$/, "");

export const storageUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes },
}).single("file");

export default async function upload_storage_file(req: Request, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "Missing multipart file field 'file'" });
      return;
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "upload.bin",
      contentType: req.file.mimetype || "application/octet-stream",
      knownLength: req.file.size,
    });
    form.append("ttlSeconds", String(req.body?.ttlSeconds || ""));

    const { data } = await axios.post(`${storageApiBaseUrl}/uploads`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    res.json({ success: true, upload: data });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}
