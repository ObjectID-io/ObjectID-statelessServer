"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.singAndExecTx = singAndExecTx;
exports.waitForFaucetTokens = waitForFaucetTokens;
const bcs_1 = require("@iota/bcs");
const axios_1 = __importDefault(require("axios"));
const faucet_1 = require("@iota/iota-sdk/faucet");
async function singAndExecTx(network, client, gasStation, useGasStation, { keyPair, tx }, callbacks) {
    try {
        if (useGasStation) {
            return await executeWithGasStation(network, client, gasStation, keyPair, tx, callbacks);
        }
        else {
            return await executeWithoutGasStation(network, client, keyPair, tx, callbacks);
        }
    }
    finally {
        if (callbacks.onSettled) {
            callbacks.onSettled();
        }
    }
}
// ✅ Metodo per eseguire la transazione SENZA la Gas Station
async function executeWithoutGasStation(network, client, keyPair, tx, callbacks) {
    console.log("Not using Gas Station");
    const sender = keyPair.toIotaAddress();
    if (network == "testnet") {
        await waitForFaucetTokens(client, sender).catch(console.error);
    }
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
async function waitForFaucetTokens(client, sender) {
    const MAX_WAIT_TIME = 15000; // 15 secondi
    const CHECK_INTERVAL = 1000; // 1 secondo
    let elapsedTime = 0;
    const balance = await client.getBalance({
        owner: sender,
        coinType: "0x2::iota::IOTA",
    });
    if (Number(balance.totalBalance) < 1000000000) {
        await (0, faucet_1.requestIotaFromFaucetV1)({
            recipient: sender,
            host: (0, faucet_1.getFaucetHost)("testnet"),
        });
        console.log("Waiting token from Faucet");
    }
    // Attendi finché il balance non raggiunge la soglia o il timeout
    while (elapsedTime < MAX_WAIT_TIME) {
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
        elapsedTime += CHECK_INTERVAL;
        const balance = await client.getBalance({
            owner: sender,
            coinType: "0x2::iota::IOTA",
        });
        if (Number(balance.totalBalance) >= 1000000000) {
            return;
        }
    }
    throw new Error("Timeout: Il faucet non ha inviato i token entro 15 secondi.");
}
async function getSponsorGas(gasBudget, gasStationUrl, gasStationToken) {
    // Configure the Axios instance with the bearer token required by the gas station
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
    // Return the result containing sponsor address, ID, and coin references
    return reservation_response.data.result;
}
async function sponsorSignAndSubmit(reservationId, transaction, senderSignature, gasStationUrl) {
    // Encode the transaction bytes to Base64, to pass along with the sender's signature
    const data = {
        reservation_id: reservationId,
        tx_bytes: (0, bcs_1.toB64)(transaction),
        user_sig: senderSignature,
    };
    // The gas station signs the transaction with its own keys, then submits it on-chain
    const response = await axios_1.default.post(gasStationUrl + "/v1/execute_tx", data);
    // Return the resulting transaction effects (including object changes, event logs, etc.)
    return response.data.effects;
}
async function attemptTransactionWithGasStation(network, client, gasStationURL, gasStationToken, keyPair, tx, // Assicurati che Transaction sia il tipo corretto
gasBudget) {
    console.log(`Attempting transaction using Gas Station: ${gasStationURL}`);
    const reservedSponsorGasData = await getSponsorGas(gasBudget, gasStationURL, gasStationToken);
    console.log(`✅ Reserved Gas Object from ${gasStationURL} in ${network}:`, reservedSponsorGasData);
    const sender = keyPair.toIotaAddress(); // Assumi che questo metodo esista
    tx.setSender(sender); // Assumi che questi metodi esistano sull'oggetto tx
    tx.setGasOwner(reservedSponsorGasData.sponsor_address);
    tx.setGasPayment(reservedSponsorGasData.gas_coins);
    tx.setGasBudget(gasBudget);
    const unsignedTxBytes = await tx.build({ client: client }); // Assumi esista tx.build
    // Assicurati che Ed25519Keypair abbia questo metodo
    const signedTx = await keyPair.signTransaction(unsignedTxBytes);
    const senderSignature = signedTx.signature; // Assumi che signature esista
    const transactionEffects = await sponsorSignAndSubmit(reservedSponsorGasData.reservation_id, unsignedTxBytes, senderSignature, gasStationURL);
    console.log(`🚀 Transaction Issued via ${gasStationURL}: https://explorer.rebased.iota.org/txblock/${transactionEffects.transactionDigest}`);
    const transactionResponse = {
        digest: transactionEffects.transactionDigest,
        effects: transactionEffects, // Assumi che transactionEffects sia compatibile
    };
    return transactionResponse;
}
async function executeWithGasStation(network, client, gasStation, keyPair, tx, callbacks) {
    const gasBudget = 50000000; // Puoi anche renderlo un parametro se necessario
    console.log("Attempting transaction with Gas Station fallback logic.");
    try {
        // --- Tentativo 1: Gas Station Primaria ---
        console.log(`Trying primary gas station: ${gasStation.gasStation1URL}`);
        const result = await attemptTransactionWithGasStation(network, client, gasStation.gasStation1URL, gasStation.gasStation1Token, keyPair, tx, // Passa la stessa istanza di tx
        gasBudget);
        callbacks.onSuccess(result);
        return { tx_effect: result, success: true };
    }
    catch (error1) {
        console.warn(`❌ Primary Gas Station (${gasStation.gasStation1URL}) failed:`, error1);
        // Verifica se sono stati forniti i dettagli per la seconda gas station
        if (gasStation.gasStation2URL && gasStation.gasStation2Token) {
            console.log(`Retrying with secondary gas station: ${gasStation.gasStation2URL}`);
            try {
                // --- Tentativo 2: Gas Station Secondaria ---
                const result = await attemptTransactionWithGasStation(network, client, gasStation.gasStation2URL, gasStation.gasStation2Token, keyPair, tx, // Passa la stessa istanza di tx (potrebbe essere stata parzialmente modificata dal primo tentativo, es. sender set)
                gasBudget);
                callbacks.onSuccess(result);
                return { tx_effect: result, success: true };
            }
            catch (error2) {
                console.error(`❌ Secondary Gas Station (${gasStation.gasStation2URL}) also failed:`, error2);
                // Entrambi i tentativi falliti, chiama onError con l'errore del secondo tentativo
                callbacks.onError(error2);
                return { tx_effect: null, success: false };
            }
        }
        else {
            console.error("❌ Primary Gas Station failed and no secondary Gas Station configured.");
            // Chiama onError con l'errore del primo tentativo poiché non c'è fallback
            callbacks.onError(error1);
            return { tx_effect: null, success: false };
        }
    }
}
exports.default = singAndExecTx;
