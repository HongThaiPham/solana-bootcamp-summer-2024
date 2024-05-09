import { initializeKeypair } from "./initializeKeypair";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  TokenStandard,
  createV1,
  mintV1,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

import * as web3 from "@solana/web3.js";
import {
  KeypairSigner,
  generateSigner,
  keypairIdentity,
  percentAmount,
  transactionBuilder,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";

import {
  base58,
  publicKey as publicKeySerializer,
  string,
} from "@metaplex-foundation/umi/serializers";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";

const METADATA_PROGRAM_ID = new web3.PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
const umi = createUmi(web3.clusterApiUrl("devnet"));
umi.use(mplTokenMetadata());
umi.use(irysUploader());

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
  const { keypair: userKeypair, umiSigner } = await initializeKeypair(
    connection
  );

  umi.use(keypairIdentity(umiSigner));
  await createFungiToken(umiSigner);
  await createNftToken(umiSigner);
}

const createNftToken = async (umiSigner: KeypairSigner) => {
  const mint = generateSigner(umi);

  const tokenInfo = {
    name: "Solana Bootcamp Summer 2024",
    symbol: "SBSL",
    descriptions: "This is a token for Solana Bootcamp Summer 2024 by Leo Pham",
    decimals: 0,
    image:
      "https://github.com/HongThaiPham/solana-bootcamp-summer-2024/blob/main/assets/logo.png?raw=true",
    attributes: [
      {
        trait_type: "Name",
        value: "Leo Pham",
      },
      {
        trait_type: "Sex",
        value: "Male",
      },
      {
        trait_type: "Shirt",
        value: "White T-Shirt",
      },
      {
        trait_type: "Pants",
        value: "Blue Jeans",
      },
      {
        trait_type: "Hat",
        value: "Black Backwards Cap",
      },
    ],
  };

  const uri = await umi.uploader.uploadJson({
    ...tokenInfo,
  });

  const seeds = [
    string({ size: "variable" }).serialize("metadata"),
    publicKeySerializer().serialize(METADATA_PROGRAM_ID),
    publicKeySerializer().serialize(mint),
  ];
  const metadata_pda = umi.eddsa.findPda(
    umiPublicKey(METADATA_PROGRAM_ID),
    seeds
  );

  let builder = transactionBuilder();

  let createV1Instruction = createV1(umi, {
    mint,
    metadata: metadata_pda,
    authority: umiSigner,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    decimals: tokenInfo.decimals,
    uri: uri,
    sellerFeeBasisPoints: percentAmount(10),
    tokenStandard: TokenStandard.NonFungible,
  });

  builder = builder.add(createV1Instruction);

  const mintToMeInstruction = mintV1(umi, {
    mint: mint.publicKey,
    authority: umiSigner,
    amount: 1,
    tokenOwner: umiSigner.publicKey,
    tokenStandard: TokenStandard.NonFungible,
  });

  builder = builder.add(mintToMeInstruction);

  const createRespone = await builder.sendAndConfirm(umi);

  console.log(
    "Create mint success: ",
    `https://explorer.solana.com/tx/${
      base58.deserialize(createRespone.signature)[0]
    }?cluster=devnet`
  );
};

const createFungiToken = async (umiSigner: KeypairSigner) => {
  const tokenInfo = {
    name: "Solana Bootcamp Summer 2024",
    symbol: "SBSL",
    descriptions: "This is a token for Solana Bootcamp Summer 2024 by Leo Pham",
    decimals: 6,
    uri: "https://raw.githubusercontent.com/HongThaiPham/solana-bootcamp-summer-2024/main/assets/sbs-token.json",
    image:
      "https://github.com/HongThaiPham/solana-bootcamp-summer-2024/blob/main/assets/logo.png?raw=true",
  };
  const mint = generateSigner(umi);

  const seeds = [
    string({ size: "variable" }).serialize("metadata"),
    publicKeySerializer().serialize(METADATA_PROGRAM_ID),
    publicKeySerializer().serialize(mint),
  ];
  const metadata_pda = umi.eddsa.findPda(
    umiPublicKey(METADATA_PROGRAM_ID),
    seeds
  );

  let builder = transactionBuilder();

  let createV1Instruction = createV1(umi, {
    mint,
    metadata: metadata_pda,
    authority: umiSigner,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    decimals: tokenInfo.decimals,
    uri: tokenInfo.uri,
    sellerFeeBasisPoints: percentAmount(0),
    tokenStandard: TokenStandard.Fungible,
  });

  builder = builder.add(createV1Instruction);

  const mintToMeInstruction = mintV1(umi, {
    mint: mint.publicKey,
    authority: umiSigner,
    amount: 100000000,
    tokenOwner: umiSigner.publicKey,
    tokenStandard: TokenStandard.Fungible,
  });

  builder = builder.add(mintToMeInstruction);

  const mintToMeOther = mintV1(umi, {
    mint: mint.publicKey,
    authority: umiSigner,
    amount: 10000000,
    tokenOwner: umiPublicKey("63EEC9FfGyksm7PkVC6z8uAmqozbQcTzbkWJNsgqjkFs"),
    tokenStandard: TokenStandard.Fungible,
  });

  builder = builder.add(mintToMeOther);

  const createRespone = await builder.sendAndConfirm(umi);

  console.log(
    "Create mint success: ",
    `https://explorer.solana.com/tx/${
      base58.deserialize(createRespone.signature)[0]
    }?cluster=devnet`
  );
};

main()
  .then(() => {
    console.log("Finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
