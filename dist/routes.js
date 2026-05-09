"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const create_object_1 = __importDefault(require("./routes/create_object"));
const update_object_mutable_metadata_1 = __importDefault(require("./routes/update_object_mutable_metadata"));
const update_owner_did_1 = __importDefault(require("./routes/update_owner_did"));
const update_agent_did_1 = __importDefault(require("./routes/update_agent_did"));
const update_geo_location_1 = __importDefault(require("./routes/update_geo_location"));
const delete_object_1 = __importDefault(require("./routes/delete_object"));
const create_event_1 = __importDefault(require("./routes/create_event"));
const update_event_mutable_metadata_1 = __importDefault(require("./routes/update_event_mutable_metadata"));
const delete_event_1 = __importDefault(require("./routes/delete_event"));
const create_counter_1 = __importDefault(require("./routes/create_counter"));
const delete_counter_1 = __importDefault(require("./routes/delete_counter"));
const counter_stepup_1 = __importDefault(require("./routes/counter_stepup"));
const counter_stepdown_1 = __importDefault(require("./routes/counter_stepdown"));
const counter_set_value_1 = __importDefault(require("./routes/counter_set_value"));
const anonymous_message_1 = __importDefault(require("./routes/anonymous_message"));
const message_1 = __importDefault(require("./routes/message"));
const creator_message_1 = __importDefault(require("./routes/creator_message"));
const control_message_1 = __importDefault(require("./routes/control_message"));
const alert_message_1 = __importDefault(require("./routes/alert_message"));
const update_object_1 = __importDefault(require("./routes/update_object"));
const update_object_did_1 = __importDefault(require("./routes/update_object_did"));
const update_op_code_1 = __importDefault(require("./routes/update_op_code"));
const update_geolocation_1 = __importDefault(require("./routes/update_geolocation"));
const create_component_1 = __importDefault(require("./routes/create_component"));
const delete_component_1 = __importDefault(require("./routes/delete_component"));
const get_object_1 = __importDefault(require("./routes/get_object"));
const get_objects_1 = __importDefault(require("./routes/get_objects"));
const get_credit_token_1 = __importDefault(require("./routes/get_credit_token"));
const create_identity_1 = __importDefault(require("./routes/create_identity"));
const link_identity_1 = __importDefault(require("./routes/link_identity"));
const create_OID_controllerCap_1 = __importDefault(require("./routes/create_OID_controllerCap"));
const download_dlvc_1 = __importDefault(require("./routes/download_dlvc"));
const get_OID_controllerCap_1 = __importDefault(require("./routes/get_OID_controllerCap"));
const get_IOTA_controllerCap_1 = __importDefault(require("./routes/get_IOTA_controllerCap"));
// --- Documents (oid_document) ---
const create_document_1 = __importDefault(require("./routes/create_document"));
const add_document_credit_1 = __importDefault(require("./routes/add_document_credit"));
const update_document_url_1 = __importDefault(require("./routes/update_document_url"));
const update_document_mutable_metadata_1 = __importDefault(require("./routes/update_document_mutable_metadata"));
const update_document_url_hash_1 = __importDefault(require("./routes/update_document_url_hash"));
const add_editors_did_1 = __importDefault(require("./routes/add_editors_did"));
const remove_editors_did_1 = __importDefault(require("./routes/remove_editors_did"));
const add_approver_did_1 = __importDefault(require("./routes/add_approver_did"));
const remove_approver_did_1 = __importDefault(require("./routes/remove_approver_did"));
const update_publisher_did_1 = __importDefault(require("./routes/update_publisher_did"));
const update_document_owner_did_1 = __importDefault(require("./routes/update_document_owner_did"));
const delete_document_1 = __importDefault(require("./routes/delete_document"));
const update_document_status_1 = __importDefault(require("./routes/update_document_status"));
const approve_document_1 = __importDefault(require("./routes/approve_document"));
const append_change_log_1 = __importDefault(require("./routes/append_change_log"));
const document_did_string_1 = __importDefault(require("./routes/document_did_string"));
const gs1_create_resource_1 = __importDefault(require("./routes/gs1_create_resource"));
const gs1_create_event_1 = __importDefault(require("./routes/gs1_create_event"));
const gs1_capture_1 = __importDefault(require("./routes/gs1_capture"));
const gs1_get_resource_1 = __importDefault(require("./routes/gs1_get_resource"));
const gs1_get_resource_events_1 = __importDefault(require("./routes/gs1_get_resource_events"));
const gs1_resolve_iota_id_1 = __importDefault(require("./routes/gs1_resolve_iota_id"));
const gs1_resolve_gs1_uri_1 = __importDefault(require("./routes/gs1_resolve_gs1_uri"));
const stripe_report_credit_consumption_1 = __importDefault(require("./routes/stripe_report_credit_consumption"));
const upload_storage_file_1 = __importStar(require("./routes/upload_storage_file"));
const get_storage_file_1 = __importDefault(require("./routes/get_storage_file"));
const delete_storage_file_1 = __importDefault(require("./routes/delete_storage_file"));
const create_storage_1 = __importDefault(require("./routes/create_storage"));
const extend_storage_1 = __importDefault(require("./routes/extend_storage"));
const delete_storage_1 = __importDefault(require("./routes/delete_storage"));
const storage_status_1 = __importDefault(require("./routes/storage_status"));
const storage_top_down_1 = __importDefault(require("./routes/storage_top_down"));
const router = (0, express_1.Router)();
router.post("/create_object", create_object_1.default);
router.post("/update_object_mutable_metadata", update_object_mutable_metadata_1.default);
router.post("/update_owner_did", update_owner_did_1.default);
router.post("/update_agent_did", update_agent_did_1.default);
router.post("/update_geo_location", update_geo_location_1.default);
router.post("/delete_object", delete_object_1.default);
router.post("/create_event", create_event_1.default);
router.post("/update_event_mutable_metadata", update_event_mutable_metadata_1.default);
router.post("/delete_event", delete_event_1.default);
router.post("/create_counter", create_counter_1.default);
router.post("/delete_counter", delete_counter_1.default);
router.post("/counter_stepup", counter_stepup_1.default);
router.post("/counter_stepdown", counter_stepdown_1.default);
router.post("/counter_set_value", counter_set_value_1.default);
router.post("/anonymous_message", anonymous_message_1.default);
router.post("/message", message_1.default);
router.post("/creator_message", creator_message_1.default);
router.post("/control_message", control_message_1.default);
router.post("/alert_message", alert_message_1.default);
router.post("/update_object", update_object_1.default);
router.post("/update_object_did", update_object_did_1.default);
router.post("/update_op_code", update_op_code_1.default);
router.post("/update_geolocation", update_geolocation_1.default);
router.post("/create_component", create_component_1.default);
router.post("/delete_component", delete_component_1.default);
router.post("/get_object", get_object_1.default);
router.post("/get_objects", get_objects_1.default);
router.post("/get_credit_token", get_credit_token_1.default);
router.post("/create_identity", create_identity_1.default);
router.post("/link_identity", link_identity_1.default);
router.post("/create_OID_controllerCap", create_OID_controllerCap_1.default);
router.post("/download_dlvc", download_dlvc_1.default);
router.post("/get_OID_controllerCap", get_OID_controllerCap_1.default);
router.post("/get_IOTA_controllerCap", get_IOTA_controllerCap_1.default);
// --- Documents (oid_document) ---
router.post("/create_document", create_document_1.default);
router.post("/add_document_credit", add_document_credit_1.default);
router.post("/update_document_url", update_document_url_1.default);
router.post("/update_document_mutable_metadata", update_document_mutable_metadata_1.default);
router.post("/update_document_url_hash", update_document_url_hash_1.default);
router.post("/add_editors_did", add_editors_did_1.default);
router.post("/remove_editors_did", remove_editors_did_1.default);
router.post("/add_approver_did", add_approver_did_1.default);
router.post("/remove_approver_did", remove_approver_did_1.default);
router.post("/update_publisher_did", update_publisher_did_1.default);
router.post("/update_document_owner_did", update_document_owner_did_1.default);
router.post("/delete_document", delete_document_1.default);
router.post("/update_document_status", update_document_status_1.default);
router.post("/approve_document", approve_document_1.default);
router.post("/append_change_log", append_change_log_1.default);
router.post("/document_did_string", document_did_string_1.default);
router.post("/gs1_create_resource", gs1_create_resource_1.default);
router.post("/gs1_create_event", gs1_create_event_1.default);
router.post("/gs1_capture", gs1_capture_1.default);
router.post("/gs1_get_resource", gs1_get_resource_1.default);
router.post("/gs1_get_resource_events", gs1_get_resource_events_1.default);
router.post("/gs1_resolve_iota_id", gs1_resolve_iota_id_1.default);
router.post("/gs1_resolve_gs1_uri", gs1_resolve_gs1_uri_1.default);
router.post("/stripe_report_credit_consumption", stripe_report_credit_consumption_1.default);
// --- OID storage ---
router.post("/storage/uploads", upload_storage_file_1.storageUploadMiddleware, upload_storage_file_1.default);
router.get("/storage/uploads/:id", get_storage_file_1.default);
router.delete("/storage/uploads/:id", delete_storage_file_1.default);
router.post("/storage/create", create_storage_1.default);
router.post("/storage/extend", extend_storage_1.default);
router.post("/storage/delete", delete_storage_1.default);
router.post("/storage/top-down", storage_top_down_1.default);
router.get("/storage/status/:objectId", storage_status_1.default);
router.post("/storage/status", storage_status_1.default);
router.stack.forEach((r) => {
    if (r.route && r.route.path) {
        console.log(`✅ Route active: ${r.route.path}`);
    }
    else if (r.name === "router") {
        console.log("➡️ Sub-router o middleware active");
    }
    else {
        console.log("❓ Unknown entry in the stack:", r);
    }
});
exports.default = router;
