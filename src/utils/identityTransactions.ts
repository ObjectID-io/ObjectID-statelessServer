// Copyright 2020-2024 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0
// Adapted from @iota/iota-interaction-ts 0.3.3 move_calls/identity/{create,update}.
// These legacy ControllerCap entrypoints are still used by deployed Identity
// packages. Return an unsigned Transaction so the common executor supplies gas.
import { bcs } from "@iota/iota-sdk/bcs";
import { Transaction } from "@iota/iota-sdk/transactions";
import type { IotaObjectRef } from "@iota/iota-sdk/client";
import { IOTA_CLOCK_OBJECT_ID } from "@iota/iota-sdk/utils";

type SharedRef = { objectId: string; initialSharedVersion: string | number; mutable: boolean };
const clock = (tx: Transaction) => tx.sharedObjectRef({ objectId: IOTA_CLOCK_OBJECT_ID, initialSharedVersion: 1, mutable: false });
const documentArg = (tx: Transaction, doc: Uint8Array) => tx.pure(bcs.option(bcs.vector(bcs.U8)).serialize(doc));

export function buildCreateIdentityTx(doc: Uint8Array, packageId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: packageId + "::identity::new", arguments: [documentArg(tx, doc), clock(tx)] });
  return tx;
}
export function buildProposeUpdateTx(identity: SharedRef, capability: IotaObjectRef, doc: Uint8Array, packageId: string, expiration?: bigint): Transaction {
  const tx = new Transaction();
  const cap = tx.objectRef(capability);
  const [token, borrow] = tx.moveCall({ target: packageId + "::controller::borrow", arguments: [cap] });
  tx.moveCall({ target: packageId + "::identity::propose_update", arguments: [tx.sharedObjectRef(identity), token, documentArg(tx, doc), tx.pure.option("u64", expiration), clock(tx)] });
  tx.moveCall({ target: packageId + "::controller::put_back", arguments: [cap, token, borrow] });
  return tx;
}
export function buildExecuteUpdateTx(identity: SharedRef, capability: IotaObjectRef, proposalId: string, packageId: string): Transaction {
  const tx = new Transaction();
  const cap = tx.objectRef(capability);
  const [token, borrow] = tx.moveCall({ target: packageId + "::controller::borrow", arguments: [cap] });
  tx.moveCall({ target: packageId + "::identity::execute_update", arguments: [tx.sharedObjectRef(identity), token, tx.pure.id(proposalId), clock(tx)] });
  tx.moveCall({ target: packageId + "::controller::put_back", arguments: [cap, token, borrow] });
  return tx;
}
