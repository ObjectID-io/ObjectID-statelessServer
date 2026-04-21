import { Router } from "express";

import create_object from "./routes/create_object";
import update_object_mutable_metadata from "./routes/update_object_mutable_metadata";
import update_owner_did from "./routes/update_owner_did";
import update_agent_did from "./routes/update_agent_did";
import update_geo_location from "./routes/update_geo_location";
import delete_object from "./routes/delete_object";

import create_event from "./routes/create_event";
import update_event_mutable_metadata from "./routes/update_event_mutable_metadata";
import delete_event from "./routes/delete_event";

import create_counter from "./routes/create_counter";
import delete_counter from "./routes/delete_counter";
import counter_stepup from "./routes/counter_stepup";
import counter_stepdown from "./routes/counter_stepdown";
import counter_set_value from "./routes/counter_set_value";

import anonymous_message from "./routes/anonymous_message";
import message from "./routes/message";
import creator_message from "./routes/creator_message";
import control_message from "./routes/control_message";
import alert_message from "./routes/alert_message";
import update_object from "./routes/update_object";
import update_object_did from "./routes/update_object_did";
import update_op_code from "./routes/update_op_code";
import update_geolocation from "./routes/update_geolocation";
import create_component from "./routes/create_component";
import delete_component from "./routes/delete_component";

import get_object from "./routes/get_object";
import get_objects from "./routes/get_objects";
import get_credit_token from "./routes/get_credit_token";
import create_identity from "./routes/create_identity";
import link_identity from "./routes/link_identity";
import create_OID_controllerCap from "./routes/create_OID_controllerCap";
import download_dlvc from "./routes/download_dlvc";
import get_OID_controllerCap from "./routes/get_OID_controllerCap";
import get_IOTA_controllerCap from "./routes/get_IOTA_controllerCap";

// --- Documents (oid_document) ---
import create_document from "./routes/create_document";
import add_document_credit from "./routes/add_document_credit";
import update_document_url from "./routes/update_document_url";
import update_document_mutable_metadata from "./routes/update_document_mutable_metadata";
import update_document_url_hash from "./routes/update_document_url_hash";
import add_editors_did from "./routes/add_editors_did";
import remove_editors_did from "./routes/remove_editors_did";
import add_approver_did from "./routes/add_approver_did";
import remove_approver_did from "./routes/remove_approver_did";
import update_publisher_did from "./routes/update_publisher_did";
import update_document_owner_did from "./routes/update_document_owner_did";
import delete_document from "./routes/delete_document";
import update_document_status from "./routes/update_document_status";
import approve_document from "./routes/approve_document";
import append_change_log from "./routes/append_change_log";
import document_did_string from "./routes/document_did_string";

const router = Router();

router.post("/create_object", create_object);
router.post("/update_object_mutable_metadata", update_object_mutable_metadata);
router.post("/update_owner_did", update_owner_did);
router.post("/update_agent_did", update_agent_did);
router.post("/update_geo_location", update_geo_location);
router.post("/delete_object", delete_object);

router.post("/create_event", create_event);
router.post("/update_event_mutable_metadata", update_event_mutable_metadata);
router.post("/delete_event", delete_event);

router.post("/create_counter", create_counter);
router.post("/delete_counter", delete_counter);
router.post("/counter_stepup", counter_stepup);
router.post("/counter_stepdown", counter_stepdown);
router.post("/counter_set_value", counter_set_value);

router.post("/anonymous_message", anonymous_message);
router.post("/message", message);
router.post("/creator_message", creator_message);
router.post("/control_message", control_message);
router.post("/alert_message", alert_message);
router.post("/update_object", update_object);
router.post("/update_object_did", update_object_did);
router.post("/update_op_code", update_op_code);
router.post("/update_geolocation", update_geolocation);
router.post("/create_component", create_component);
router.post("/delete_component", delete_component);

router.post("/get_object", get_object);
router.post("/get_objects", get_objects);
router.post("/get_credit_token", get_credit_token);
router.post("/create_identity", create_identity);
router.post("/link_identity", link_identity);
router.post("/create_OID_controllerCap", create_OID_controllerCap);
router.post("/download_dlvc", download_dlvc);
router.post("/get_OID_controllerCap", get_OID_controllerCap);
router.post("/get_IOTA_controllerCap", get_IOTA_controllerCap);

// --- Documents (oid_document) ---
router.post("/create_document", create_document);
router.post("/add_document_credit", add_document_credit);
router.post("/update_document_url", update_document_url);
router.post("/update_document_mutable_metadata", update_document_mutable_metadata);
router.post("/update_document_url_hash", update_document_url_hash);
router.post("/add_editors_did", add_editors_did);
router.post("/remove_editors_did", remove_editors_did);
router.post("/add_approver_did", add_approver_did);
router.post("/remove_approver_did", remove_approver_did);
router.post("/update_publisher_did", update_publisher_did);
router.post("/update_document_owner_did", update_document_owner_did);
router.post("/delete_document", delete_document);
router.post("/update_document_status", update_document_status);
router.post("/approve_document", approve_document);
router.post("/append_change_log", append_change_log);
router.post("/document_did_string", document_did_string);

router.stack.forEach((r: any) => {
  if (r.route && r.route.path) {
    console.log(`✅ Route active: ${r.route.path}`);
  } else if (r.name === "router") {
    console.log("➡️ Sub-router o middleware active");
  } else {
    console.log("❓ Unknown entry in the stack:", r);
  }
});

export default router;
