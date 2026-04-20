import axios from "axios";
import type { Request, Response } from "express";
import { nullSeed, setupEnv } from "./_common";

const ORACLE_BASE_URL = "https://api.objectid.io/api";
const ORACLE_CREATE_OID_CONTROLLER_CAP_URL = `${ORACLE_BASE_URL}/create-OID-controllerCap`;

export default async function get_OID_controllerCap(req: Request, res: Response) {
  try {
    const { controllerCap, network } = req.body ?? {};

    if (!controllerCap || typeof controllerCap !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'controllerCap'." });
      return;
    }

    if (!network || typeof network !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'network'." });
      return;
    }

    const { packageID } = await setupEnv(nullSeed, network);

    const oracleRes = await axios.post(
      ORACLE_CREATE_OID_CONTROLLER_CAP_URL,
      {
        packageid: packageID,
        controllerCap,
        network,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 60_000,
      },
    );

    res.status(oracleRes.status).json({
      ...oracleRes.data,
      controllerCap,
    });
  } catch (err: any) {
    const status = Number(err?.response?.status) || 500;
    const data = err?.response?.data;
    const error =
      data?.error ??
      data?.message ??
      err?.message ??
      "Failed to retrieve OIDControllerCap from oracle.";

    console.error("get_OID_controllerCap failed:", err);
    res.status(status).json({
      success: false,
      error,
      oracleResponse: data ?? null,
    });
  }
}
