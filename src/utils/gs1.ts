type ParsedEpcUrn =
  | { scheme: "sgtin"; companyPrefix: string; itemReference: string; serial: string; gtin14: string }
  | { scheme: "sgln"; companyPrefix: string; locationReference: string; extension: string; gln13: string }
  | { scheme: "sscc"; companyPrefix: string; serialReference: string; sscc18: string }
  | { scheme: "unknown"; raw: string };

export type EpcisEventType = "ObjectEvent" | "AggregationEvent" | "TransformationEvent" | "AssociationEvent";

export type EpcisEvent = {
  type?: string;
  eventType?: string;
  eventTime?: string;
  eventTimeZoneOffset?: string;
  eventID?: string;
  eventId?: string;
  action?: string;
  bizStep?: string;
  disposition?: string;
  readPoint?: { id?: string };
  bizLocation?: { id?: string };
  epcList?: string[];
  parentID?: string;
  childEPCs?: string[];
  childEPCList?: string[];
  childEpcList?: string[];
  childIDs?: string[];
  inputEPCList?: string[];
  outputEPCList?: string[];
  inputQuantityList?: any[];
  outputQuantityList?: any[];
  transformationID?: string;
  transformationId?: string;
  associationType?: string;
  bizTransactionList?: any;
  sourceList?: any;
  destinationList?: any;
  ilmd?: any;
  sensorElementList?: any;
  errorDeclaration?: any;
  [k: string]: any;
};

export type EpcisDocument = {
  eventID?: string;
  id?: string;
  documentId?: string;
  epcisBody?: any;
  eventList?: EpcisEvent[];
  [k: string]: any;
};

export type CaptureRequest = EpcisDocument | EpcisEvent[];

export type NormalizedEvent = {
  objectKey: {
    epcUri?: string;
    gtin?: string;
    serial?: string;
  };
  eventType:
    | "epcis_object_event"
    | "epcis_aggregation_event"
    | "epcis_transformation_event"
    | "epcis_association_event";
  eventImmutable: Record<string, any>;
  eventMutable: Record<string, any>;
};

function gs1CheckDigit(base: string): number {
  const digits = base.replace(/\D/g, "");
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) {
      throw new Error("Invalid digit");
    }
    sum += digit * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function toGtin14(companyPrefix: string, itemReference: string): string {
  const base13 = (companyPrefix + itemReference).padStart(13, "0");
  return `${base13}${gs1CheckDigit(base13)}`;
}

function toGln13(companyPrefix: string, locationReference: string): string {
  const base12 = (companyPrefix + locationReference).padStart(12, "0");
  return `${base12}${gs1CheckDigit(base12)}`;
}

function toSscc18(companyPrefix: string, serialReference: string): string {
  const base17 = (companyPrefix + serialReference).padStart(17, "0");
  return `${base17}${gs1CheckDigit(base17)}`;
}

export function parseEpcUrn(epc: string): ParsedEpcUrn {
  const raw = String(epc ?? "").trim();
  const sgtin = raw.match(/^urn:epc:id:sgtin:([0-9]+)\.([0-9]+)\.([^\s]+)$/i);
  if (sgtin) {
    return {
      scheme: "sgtin",
      companyPrefix: sgtin[1],
      itemReference: sgtin[2],
      serial: sgtin[3],
      gtin14: toGtin14(sgtin[1], sgtin[2]),
    };
  }

  const sgln = raw.match(/^urn:epc:id:sgln:([0-9]+)\.([0-9]+)\.([^\s]+)$/i);
  if (sgln) {
    return {
      scheme: "sgln",
      companyPrefix: sgln[1],
      locationReference: sgln[2],
      extension: sgln[3],
      gln13: toGln13(sgln[1], sgln[2]),
    };
  }

  const sscc = raw.match(/^urn:epc:id:sscc:([0-9]+)\.([0-9]+)$/i);
  if (sscc) {
    return {
      scheme: "sscc",
      companyPrefix: sscc[1],
      serialReference: sscc[2],
      sscc18: toSscc18(sscc[1], sscc[2]),
    };
  }

  return { scheme: "unknown", raw };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? "");
  }
}

function pickEventType(event: EpcisEvent): EpcisEventType | null {
  const value = String(event.type ?? event.eventType ?? "");
  if (value === "ObjectEvent") return "ObjectEvent";
  if (value === "AggregationEvent") return "AggregationEvent";
  if (value === "TransformationEvent") return "TransformationEvent";
  if (value === "AssociationEvent") return "AssociationEvent";
  return null;
}

function firstEpc(event: EpcisEvent): string | undefined {
  if (Array.isArray(event.epcList) && event.epcList.length) return String(event.epcList[0] ?? "");
  const child = event.childEPCs ?? event.childEPCList ?? event.childEpcList ?? event.childIDs;
  if (Array.isArray(child) && child.length) return String(child[0] ?? "");
  if (typeof event.parentID === "string" && event.parentID) return event.parentID;
  return undefined;
}

function fallbackGtinSerial(event: any): { gtin?: string; serial?: string } {
  const gtin = event?.gtin ?? event?.GTIN ?? event?.ilmd?.gtin ?? event?.ilmd?.GTIN ?? event?.extension?.gtin;
  const serial =
    event?.serial ??
    event?.serialNumber ??
    event?.ilmd?.serial ??
    event?.ilmd?.serialNumber ??
    event?.extension?.serial ??
    event?.extension?.serialNumber;

  const normalizedGtin = typeof gtin === "string" || typeof gtin === "number" ? String(gtin).trim() : "";
  const normalizedSerial = typeof serial === "string" || typeof serial === "number" ? String(serial).trim() : "";

  return {
    gtin: normalizedGtin || undefined,
    serial: normalizedSerial || undefined,
  };
}

function extractGln(id?: string): string | undefined {
  if (!id) return undefined;
  const parsed = parseEpcUrn(id);
  if (parsed.scheme === "sgln") return parsed.gln13;
  if (/^\d{13}$/.test(id)) return id;
  return undefined;
}

function randomEventId(): string {
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function mapEventType(
  eventType: EpcisEventType
): "epcis_object_event" | "epcis_aggregation_event" | "epcis_transformation_event" | "epcis_association_event" {
  switch (eventType) {
    case "ObjectEvent":
      return "epcis_object_event";
    case "AggregationEvent":
      return "epcis_aggregation_event";
    case "TransformationEvent":
      return "epcis_transformation_event";
    case "AssociationEvent":
      return "epcis_association_event";
  }
}

export function extractEventList(body: CaptureRequest): { events: EpcisEvent[]; docRef?: string } {
  if (Array.isArray(body)) return { events: body };

  const doc = body as EpcisDocument;
  const docRef = String(doc.eventID ?? doc.id ?? doc.documentId ?? "").trim() || undefined;

  const candidates: any[] = [
    doc.eventList,
    doc.epcisBody?.eventList,
    doc.epcisBody?.eventList?.eventList,
    doc.epcisBody?.eventList?.events,
    doc.epcisBody?.events,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return { events: candidate as EpcisEvent[], docRef };
  }

  const eventListByType = doc.epcisBody?.eventList;
  if (eventListByType && typeof eventListByType === "object") {
    const flattened: EpcisEvent[] = [];
    for (const value of Object.values(eventListByType)) {
      if (Array.isArray(value)) flattened.push(...(value as EpcisEvent[]));
    }
    if (flattened.length) return { events: flattened, docRef };
  }

  return { events: [], docRef };
}

export function normalizeEpcisEvent(
  event: EpcisEvent,
  context: { capturedByDid?: string; captureSystem?: string; epcisDocumentRef?: string }
): NormalizedEvent {
  const eventType = pickEventType(event);
  if (!eventType) {
    throw new Error(`Unsupported EPCIS event type: ${String(event.type ?? event.eventType ?? "")}`);
  }

  const epcUri = firstEpc(event);
  const parsed = epcUri ? parseEpcUrn(epcUri) : { scheme: "unknown" as const, raw: "" };

  let gtin = parsed.scheme === "sgtin" ? parsed.gtin14 : undefined;
  let serial = parsed.scheme === "sgtin" ? parsed.serial : undefined;
  if (!epcUri && !(gtin && serial)) {
    const fallback = fallbackGtinSerial(event);
    gtin = fallback.gtin;
    serial = fallback.serial;
  }

  const eventId = String(event.eventID ?? event.eventId ?? "").trim() || randomEventId();
  const eventTime = String(event.eventTime ?? "").trim() || new Date().toISOString();
  const mappedType = mapEventType(eventType);

  const immutable: Record<string, any> = {
    event_id: eventId,
    event_time: eventTime,
    event_timezone_offset: String(event.eventTimeZoneOffset ?? "+00:00"),
    action: String(event.action ?? "OBSERVE"),
    biz_step_uri: String(event.bizStep ?? ""),
    disposition_uri: String(event.disposition ?? ""),
    read_point_gln: extractGln(event.readPoint?.id) ?? "",
    biz_location_gln: extractGln(event.bizLocation?.id) ?? "",
    biz_transactions_json: safeJsonStringify(event.bizTransactionList ?? null),
    source_list_json: safeJsonStringify(event.sourceList ?? null),
    destination_list_json: safeJsonStringify(event.destinationList ?? null),
    capture_system: context.captureSystem ?? "objectid-statelessserver",
    captured_by_did: context.capturedByDid ?? "",
    epcis_document_ref: context.epcisDocumentRef ?? "",
  };

  if (mappedType === "epcis_aggregation_event" || mappedType === "epcis_association_event") {
    immutable.parent_id = String(event.parentID ?? "");
    immutable.child_ids_json = safeJsonStringify(event.childEPCs ?? event.childEPCList ?? event.childEpcList ?? event.childIDs ?? []);
  }

  if (mappedType === "epcis_transformation_event") {
    immutable.transformation_id = String(event.transformationID ?? event.transformationId ?? "");
    immutable.input_ids_json = safeJsonStringify(event.inputEPCList ?? event.inputQuantityList ?? []);
    immutable.output_ids_json = safeJsonStringify(event.outputEPCList ?? event.outputQuantityList ?? []);
  }

  if (mappedType === "epcis_association_event") {
    immutable.association_type = String(event.associationType ?? "");
  }

  const mutable = {
    ilmd_json: safeJsonStringify(event.ilmd ?? null),
    sensor_elements_json: safeJsonStringify(event.sensorElementList ?? null),
    error_declaration_json: safeJsonStringify(event.errorDeclaration ?? null),
    extensions_json: safeJsonStringify({ original: event }),
  };

  return {
    objectKey: { epcUri, gtin, serial },
    eventType: mappedType,
    eventImmutable: immutable,
    eventMutable: mutable,
  };
}
