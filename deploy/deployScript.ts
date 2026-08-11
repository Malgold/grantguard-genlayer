import { readFileSync } from "fs";
import path from "path";
import {
  DecodedDeployData,
  GenLayerChain,
  GenLayerClient,
  TransactionHash,
  TransactionStatus,
} from "genlayer-js/types";
import { localnet } from "genlayer-js/chains";

export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), "contracts/grant_guard.py");
  const contractCode = new Uint8Array(readFileSync(filePath));

  await client.initializeConsensusSmartContract();
  const hash = await client.deployContract({ code: contractCode, args: [] });
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as TransactionHash,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
  });

  if (
    receipt.status !== 5 &&
    receipt.status !== 6 &&
    receipt.statusName !== "ACCEPTED" &&
    receipt.statusName !== "FINALIZED"
  ) {
    throw new Error(`Deployment failed: ${JSON.stringify(receipt)}`);
  }

  const address =
    (client.chain as GenLayerChain).id === localnet.id
      ? receipt.data?.contract_address
      : (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;

  if (!address) {
    throw new Error(`Deployment succeeded without a contract address: ${JSON.stringify(receipt)}`);
  }

  console.log(`GrantGuard deployed at: ${address}`);
}
