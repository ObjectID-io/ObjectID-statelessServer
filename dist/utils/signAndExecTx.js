"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.singAndExecTx = singAndExecTx;
exports.getSponsorGas = getSponsorGas;
exports.sponsorSignAndSubmit = sponsorSignAndSubmit;
exports.reserveGas = reserveGas;
const bcs_1 = require("@iota/bcs");
const axios_1 = __importDefault(require("axios"));
async function singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, callbacks) {
    try {
        if (useGasStation) {
            return await executeWithGasStation(network, client, gasStation, keyPair, tx, callbacks);
        }
        else {
            return await executeWithoutGasStation(client, keyPair, tx, callbacks);
        }
    }
    finally {
        callbacks.onSettled?.();
    }
}
// Executes the transaction WITHOUT the Gas Station
async function executeWithoutGasStation(client, keyPair, tx, callbacks) {
    console.log("Not using Gas Station");
    const sender = keyPair.toIotaAddress();
    try {
        tx.setSender(sender);
        const result = await client.signAndExecuteTransaction({
            signer: keyPair,
            transaction: tx,
        });
        const txEffect = await client.waitForTransaction({
            digest: result.digest,
            options: { showEffects: true },
        });
        callbacks.onSuccess(txEffect);
        return { tx_effect: txEffect, success: true };
    }
    catch (error) {
        console.error("❌ Error executing transaction without Gas Station:", error);
        callbacks.onError(error);
        return { tx_effect: null, success: false };
    }
}
async function getSponsorGas(gasBudget, gasStationUrl, gasStationToken) {
    // Configure Axios with the bearer token required by the gas station
    axios_1.default.defaults.headers.common = {
        Authorization: `Bearer ${gasStationToken}`,
    };
    // Prepare the reservation request
    const requestData = {
        gas_budget: gasBudget,
        reserve_duration_secs: 10,
    };
    // Call the gas station endpoint to reserve gas
    const reservation_response = await axios_1.default.post(gasStationUrl + "/v1/reserve_gas", requestData);
    // Return sponsor address, reservation id, and coin references
    return reservation_response.data.result;
}
async function sponsorSignAndSubmit(reservationId, transaction, senderSignature, gasStationUrl) {
    // Encode tx bytes to Base64 and attach the sender signature
    const data = {
        reservation_id: reservationId,
        tx_bytes: (0, bcs_1.toB64)(transaction),
        user_sig: senderSignature,
    };
    // Gas station signs the transaction with its own keys and submits it on-chain
    const response = await axios_1.default.post(gasStationUrl + "/v1/execute_tx", data);
    // Return the resulting transaction effects
    return response.data.effects;
}
async function reserveGas(gasBudget, gasStation) {
    const useFirst = Math.random() < 0.5;
    const primary = useFirst ? "gasStation1" : "gasStation2";
    const fallback = useFirst ? "gasStation2" : "gasStation1";
    try {
        const data = await getSponsorGas(gasBudget, gasStation[`${primary}URL`], gasStation[`${primary}Token`]);
        return {
            sponsor_address: data.sponsor_address,
            reservation_id: data.reservation_id,
            gas_coins: [
                {
                    objectId: data.gas_coins[0].objectId,
                    version: data.gas_coins[0].version.toString(),
                    digest: data.gas_coins[0].digest,
                },
            ],
            gasStationUsed: gasStation[`${primary}URL`],
        };
    }
    catch {
        const data = await getSponsorGas(gasBudget, gasStation[`${fallback}URL`], gasStation[`${fallback}Token`]);
        return {
            sponsor_address: data.sponsor_address,
            reservation_id: data.reservation_id,
            gas_coins: [
                {
                    objectId: data.gas_coins[0].objectId,
                    version: data.gas_coins[0].version.toString(),
                    digest: data.gas_coins[0].digest,
                },
            ],
            gasStationUsed: gasStation[`${fallback}URL`],
        };
    }
}
async function attemptTransactionWithGasStation(network, client, gasStationURL, gasStationToken, keyPair, tx, gasBudget) {
    console.log(`Attempting transaction using Gas Station: ${gasStationURL}`);
    const reservedSponsorGasData = await getSponsorGas(gasBudget, gasStationURL, gasStationToken);
    console.log(`✅ Reserved Gas Object from ${gasStationURL} in ${network}:`, reservedSponsorGasData);
    const sender = keyPair.toIotaAddress();
    tx.setSender(sender);
    tx.setGasOwner(reservedSponsorGasData.sponsor_address);
    tx.setGasPayment(reservedSponsorGasData.gas_coins);
    tx.setGasBudget(gasBudget);
    const unsignedTxBytes = await tx.build({ client });
    const signedTx = await keyPair.signTransaction(unsignedTxBytes);
    const senderSignature = signedTx.signature;
    const transactionEffects = await sponsorSignAndSubmit(reservedSponsorGasData.reservation_id, unsignedTxBytes, senderSignature, gasStationURL);
    console.log(`🚀 Transaction Issued via ${gasStationURL}: https://explorer.rebased.iota.org/txblock/${transactionEffects.transactionDigest}`);
    const transactionResponse = {
        digest: transactionEffects.transactionDigest,
        effects: transactionEffects,
    };
    return transactionResponse;
}
async function executeWithGasStation(network, client, gasStation, keyPair, tx, callbacks) {
    const gasBudget = 50000000;
    console.log("Attempting transaction with Gas Station fallback logic.");
    try {
        // Attempt 1: Primary Gas Station
        console.log(`Trying primary gas station: ${gasStation.gasStation1URL}`);
        const result = await attemptTransactionWithGasStation(network, client, gasStation.gasStation1URL, gasStation.gasStation1Token, keyPair, tx, gasBudget);
        callbacks.onSuccess(result);
        return { tx_effect: result, success: true };
    }
    catch (error1) {
        console.warn(`❌ Primary Gas Station (${gasStation.gasStation1URL}) failed:`, error1);
        // Attempt 2: Secondary Gas Station (if configured)
        if (gasStation.gasStation2URL && gasStation.gasStation2Token) {
            console.log(`Retrying with secondary gas station: ${gasStation.gasStation2URL}`);
            try {
                const result = await attemptTransactionWithGasStation(network, client, gasStation.gasStation2URL, gasStation.gasStation2Token, keyPair, tx, gasBudget);
                callbacks.onSuccess(result);
                return { tx_effect: result, success: true };
            }
            catch (error2) {
                console.error(`❌ Secondary Gas Station (${gasStation.gasStation2URL}) also failed:`, error2);
                callbacks.onError(error2);
                return { tx_effect: null, success: false };
            }
        }
        else {
            console.error("❌ Primary Gas Station failed and no secondary Gas Station configured.");
            callbacks.onError(error1);
            return { tx_effect: null, success: false };
        }
    }
}
exports.default = singAndExecTx;
