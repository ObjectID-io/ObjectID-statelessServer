import { IotaClient, IotaObjectData } from "@iota/iota-sdk/client";

export async function getObject(client: IotaClient, id: string) {
  if (!id) return {};

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
  return data as IotaObjectData;
}
