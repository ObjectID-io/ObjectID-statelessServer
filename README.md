This repository provides a REST API server that you can run on your own private infrastructure.  
The server exposes HTTP endpoints that simplify interaction with the ObjectID smart contracts.

Each API call requires a set of common parameters:

- `seed`
- `creditToken`
- `OIDControllerCap` or `IotaControllerCap` (the identity objects)

In addition to these, each endpoint may require function-specific parameters.

All parameter values (except the `seed`) can be found in the **"Identity and Info"** page of the ObjectID dApp.

A Docker configuration is included to run the server behind your own URL and avoid CORS issues. You need to add the traefik container if you have not it already runing in your docker enviroment.
Please adapt the Docker and URL configuration to your specific deployment environment.

For the `create_OID_controllerCap` route you must provide an oracle signer seed via environment:

- `TESTNET_ORACLE_SEED` or `ORACLE_SEED_TESTNET`
- `MAINNET_ORACLE_SEED` or `ORACLE_SEED_MAINNET`

As a fallback, `ORACLE_SEED` is also supported.

## Storage

The stateless server exposes storage helper endpoints used by the ObjectID storage flow.

Set the public storage backend API used for temporary uploads and sponsorship:

```bash
STORAGE_API_BASE_URL=https://api.storage.objectid.io/api
```

The stateless server is not meant to be public because requests include the user seed. For this reason `/storage/uploads` does not store the file locally: it forwards the multipart upload to the public ObjectID storage backend, exactly like the storage frontend does.

Upload a file:

```bash
curl -X POST "http://localhost:3002/storage/uploads" \
  -F "file=@/path/to/file.jpg" \
  -F "ttlSeconds=1800"
```

Example from WSL:

```bash
curl -X POST "http://localhost:3002/storage/uploads" \
  -F "file=@/mnt/c/Users/sdellava/Downloads/bag.jpg" \
  -F "ttlSeconds=1800"
```

The response includes the temporary upload metadata returned by the storage backend:

```json
{
  "success": true,
  "upload": {
    "id": "...",
    "fileName": "bag.jpg",
    "mimeType": "image/jpeg",
    "size": 121685,
    "sha256": "...",
    "url": "https://api.storage.objectid.io/uploads/...",
    "expiresAtMs": 0
  }
}
```

Example upload response:

```json
{
  "success": true,
  "upload": {
    "id": "f32b2f13-22fe-4a55-b86d-ab41ef01869f",
    "fileName": "bag.jpg",
    "mimeType": "image/jpeg",
    "size": 121685,
    "sha256": "29476398a19fc00254a691202eacd6ee534a46edb05e7bff84c1bbb0f5a22bcb",
    "url": "https://api.storage.objectid.io/uploads/f32b2f13-22fe-4a55-b86d-ab41ef01869f",
    "expiresAtMs": 1778341406823
  }
}
```

Download/read the temporary file:

```bash
curl -L "http://localhost:3002/storage/uploads/<upload-id>" --output file.jpg
```

Delete the temporary file:

```bash
curl -X DELETE "http://localhost:3002/storage/uploads/<upload-id>"
```

Storage on-chain routes follow the same pattern as the other stateless routes: the request provides `seed`, `network`, the required credit token and identity controller cap, and the server signs with the private key derived from the seed.

For storage calls, pass the IOTA Identity controller cap as `IOTAcontrollerCap`. Do not pass the ObjectID `oid_identity::ControllerCap` as the storage identity cap.

Create a storage object and the related oracle task:

```bash
curl -X POST "http://localhost:3002/storage/create" \
  -H "Content-Type: application/json" \
  -d '{
    "seed": "<SEED>",
    "network": "testnet",
    "creditToken": "0x1e1122c075dd80655d971be61eb37cd8fc8e3b8d2f5e904722f427419620065f",
    "IOTAcontrollerCap": "0x139b083d5dce7ee9eddce328a073a200f95170b46ca0400b022109daef624751",

    "fileName": "bag.jpg",
    "mimeType": "image/jpeg",
    "fileSizeBytes": 121685,
    "sha256": "29476398a19fc00254a691202eacd6ee534a46edb05e7bff84c1bbb0f5a22bcb",
    "tempUrl": "https://api.storage.objectid.io/uploads/f32b2f13-22fe-4a55-b86d-ab41ef01869f",

    "creditsToBurn": 11,
    "paymentIota": "1082254771"
  }'
```

For template `4`, `/storage/create` fills these defaults when omitted:

- `oracleTemplateId`: `4`
- `oracleProfileId`: `oracle-template-4`
- `requestedNodes`: `1`
- `quorumK`: `1`
- `retentionDays`: `30`
- `declaredDownloadBytes`: `fileSizeBytes`
- `mediationMode`: `0`
- `varianceMax`: `0`
- `createResultControllerCap`: `0`
- `executionCount`: `1`
- `intervalMs`: `0`
- `endScheduleMs`: `0`
- `plannedDeletionAtMs`: now plus one retention period
- `oraclePayloadText`: generated from `tempUrl`, `sha256`, `fileName`, `mimeType`, and `fileSizeBytes`

Successful test values:

- Transaction digest: `3S4twuRybjVbtLKJuUNpHeXujJbSYktympUGQn4BeeMb`
- Storage Object ID: `0x364633c4db054597e3388e18ff32ffbc6cb157989d1b043057bf383d617bef39`
- Oracle Task ID: `0x28d2df2d90cd0ce2f5488f43693046479fc7644cb42e2e2c45559f83f60ae796`
- TaskOwnerCap ID: `0x541c77d61c00906d90f9406fed7ebaac3449d8d391083ae4fd3aee029e5239a2`

Available storage routes:

- `POST /storage/create`
- `POST /storage/extend`
- `POST /storage/delete`
- `GET /storage/status/:objectId`
- `POST /storage/status`
