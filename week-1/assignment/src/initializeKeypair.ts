import * as web3 from "@solana/web3.js";
import * as fs from "fs";

import dotenv from "dotenv";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  KeypairSigner,
  createSignerFromKeypair,
} from "@metaplex-foundation/umi";
dotenv.config();

export async function initializeKeypair(
  connection: web3.Connection
): Promise<{ keypair: web3.Keypair; umiSigner: KeypairSigner }> {
  const umi = createUmi(web3.clusterApiUrl("devnet"));
  let keypair: web3.Keypair;

  if (!process.env.PRIVATE_KEY) {
    console.log("Creating .env file");
    keypair = web3.Keypair.generate();
    fs.writeFileSync(".env", `PRIVATE_KEY=[${keypair.secretKey.toString()}]`);
  } else {
    const secret = JSON.parse(process.env.PRIVATE_KEY ?? "") as number[];
    const secretKey = Uint8Array.from(secret);
    keypair = web3.Keypair.fromSecretKey(secretKey);
  }
  let umiKeypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey);
  const umiSigner = createSignerFromKeypair(umi, umiKeypair);
  console.log("PublicKey:", keypair.publicKey.toBase58());
  await airdropSolIfNeeded(keypair, connection);
  return { keypair, umiSigner };
}

async function airdropSolIfNeeded(
  signer: web3.Keypair,
  connection: web3.Connection
) {
  const balance = await connection.getBalance(signer.publicKey);
  console.log("Current balance is", balance / web3.LAMPORTS_PER_SOL);

  if (balance < web3.LAMPORTS_PER_SOL) {
    console.log("Airdropping 1 SOL...");
    const airdropSignature = await connection.requestAirdrop(
      signer.publicKey,
      web3.LAMPORTS_PER_SOL
    );

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction(
      {
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: airdropSignature,
      },
      "finalized"
    );

    const newBalance = await connection.getBalance(signer.publicKey);
    console.log("New balance is", newBalance / web3.LAMPORTS_PER_SOL);
  }
}
