import type { Request, Response } from "express";
import axios from "axios";

type StripeModeConfig = {
  sandbox: boolean;
  secretKey: string;
  meterId: string;
  eventName?: string;
};

function isDidTestnet(did: string): boolean {
  return String(did || "").toLowerCase().includes(":testnet:");
}

function readSandbox(req: Request, did: string): boolean {
  const v = (req.body as any)?.sandbox;
  if (v === true || v === 1 || v === "1" || v === "true") return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return isDidTestnet(did);
}

function buildStripeConfig(sandbox: boolean): StripeModeConfig {
  const liveKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const testKey = String(process.env.STRIPE_SECRET_KEY_TEST || "").trim();

  const liveMeterId = String(process.env.STRIPE_SUBSCRIPTION_METER_ID || process.env.STRIPE_METER_ID || "").trim();
  const testMeterId = String(process.env.STRIPE_SUBSCRIPTION_METER_ID_TEST || process.env.STRIPE_METER_ID_TEST || "").trim();

  const liveEventName = String(process.env.STRIPE_SUBSCRIPTION_METER_EVENT_NAME || process.env.STRIPE_METER_EVENT_NAME || "").trim();
  const testEventName = String(
    process.env.STRIPE_SUBSCRIPTION_METER_EVENT_NAME_TEST || process.env.STRIPE_METER_EVENT_NAME_TEST || "",
  ).trim();

  return sandbox
    ? { sandbox: true, secretKey: testKey, meterId: testMeterId, eventName: testEventName || undefined }
    : { sandbox: false, secretKey: liveKey, meterId: liveMeterId, eventName: liveEventName || undefined };
}

async function findCustomerIdByDid(baseUrl: string, secretKey: string, did: string): Promise<string | null> {
  const customers = await axios.get(`${baseUrl}/v1/customers`, {
    params: { limit: 100 },
    auth: { username: secretKey, password: "" },
    timeout: 15000,
  });

  const list = Array.isArray(customers.data?.data) ? customers.data.data : [];
  const c = list.find((item: any) => String(item?.metadata?.oid_did || "").trim() === did);
  return c?.id ? String(c.id) : null;
}

async function resolveEventName(baseUrl: string, secretKey: string, meterId: string, fallback?: string): Promise<string> {
  if (fallback && fallback.trim()) return fallback.trim();
  const meter = await axios.get(`${baseUrl}/v1/billing/meters/${encodeURIComponent(meterId)}`, {
    auth: { username: secretKey, password: "" },
    timeout: 15000,
  });
  const eventName = String(meter.data?.event_name || "").trim();
  if (!eventName) {
    throw new Error("Missing Stripe meter event_name. Set STRIPE_SUBSCRIPTION_METER_EVENT_NAME(_TEST) or verify meter config.");
  }
  return eventName;
}

export default async function stripe_report_credit_consumption(req: Request, res: Response) {
  try {
    const did = String((req.body as any)?.did || "").trim();
    const consumedRaw = Number((req.body as any)?.consumed ?? (req.body as any)?.quantity ?? 1);
    const identifier = String((req.body as any)?.identifier || (req.body as any)?.eventId || "").trim();
    const tsRaw = (req.body as any)?.timestamp;
    const timestamp = Number.isFinite(Number(tsRaw)) ? Math.floor(Number(tsRaw)) : Math.floor(Date.now() / 1000);

    if (!did) {
      res.status(400).json({ success: false, error: "Missing did" });
      return;
    }
    if (!Number.isFinite(consumedRaw) || consumedRaw <= 0) {
      res.status(400).json({ success: false, error: "Invalid consumed quantity" });
      return;
    }

    const consumed = Math.floor(consumedRaw);
    if (consumed <= 0) {
      res.status(400).json({ success: false, error: "Consumed quantity must be >= 1" });
      return;
    }

    const sandbox = readSandbox(req, did);
    const modeCfg = buildStripeConfig(sandbox);
    if (!modeCfg.secretKey) {
      res.status(500).json({
        success: false,
        error: sandbox ? "Missing STRIPE_SECRET_KEY_TEST" : "Missing STRIPE_SECRET_KEY",
      });
      return;
    }
    if (!modeCfg.meterId) {
      res.status(500).json({
        success: false,
        error: sandbox ? "Missing STRIPE_SUBSCRIPTION_METER_ID_TEST" : "Missing STRIPE_SUBSCRIPTION_METER_ID",
      });
      return;
    }

    const baseUrl = "https://api.stripe.com";
    const customerId = await findCustomerIdByDid(baseUrl, modeCfg.secretKey, did);
    if (!customerId) {
      res.status(404).json({ success: false, error: "Stripe customer not found for oid_did", did, sandbox });
      return;
    }

    const eventName = await resolveEventName(baseUrl, modeCfg.secretKey, modeCfg.meterId, modeCfg.eventName);
    const eventIdentifier = identifier || `oid-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

    const payload = new URLSearchParams();
    payload.set("event_name", eventName);
    payload.set("identifier", eventIdentifier);
    payload.set("timestamp", String(timestamp));
    payload.set("payload[value]", String(consumed));
    payload.set("payload[stripe_customer_id]", customerId);

    const meterEvent = await axios.post(`${baseUrl}/v1/billing/meter_events`, payload, {
      auth: { username: modeCfg.secretKey, password: "" },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    });

    res.json({
      success: true,
      did,
      sandbox,
      customerId,
      meterId: modeCfg.meterId,
      eventName,
      identifier: eventIdentifier,
      consumed,
      meterEventId: String(meterEvent.data?.id || ""),
    });
  } catch (err: any) {
    const stripeMsg = String(err?.response?.data?.error?.message || "").trim();
    const msg = stripeMsg || err?.message || "Unexpected error";
    res.status(500).json({
      success: false,
      error: msg,
      ...(err?.response?.data?.error?.code ? { code: err.response.data.error.code } : {}),
      ...(err?.response?.data?.error?.param ? { param: err.response.data.error.param } : {}),
    });
  }
}

