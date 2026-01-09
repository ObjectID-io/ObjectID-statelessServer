"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObject = getObject;
async function getObject(client, id) {
    if (!id)
        return {};
    const { data } = await client.getObject({
        id,
        options: {
            showType: true,
            showOwner: false,
            showPreviousTransaction: false,
            showDisplay: true,
            showContent: true,
            showBcs: true,
            showStorageRebate: false,
        },
    });
    return data;
}
