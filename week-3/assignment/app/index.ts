import { AnchorProvider, BN, Program, Wallet, web3 } from "@coral-xyz/anchor";
import dotenv from "dotenv";
import { StakeProgram } from "../target/types/stake_program";
dotenv.config();

import idl from "../target/idl/stake_program.json";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const SIGNER_WALLET = web3.Keypair.fromSecretKey(
  new Uint8Array(process.env.MY_TEST_WALLET!.split(",").map((s) => parseInt(s)))
);
const PROGRAM_ID = new web3.PublicKey(
  "8mNgdh9mDsW14UYNbk9kTZbrycMfwFRy9hKTRVQ4hPvD"
);
const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
let tx;
async function main() {
  const signer = new Wallet(SIGNER_WALLET);
  console.log("Signer wallet address: ", signer.publicKey.toBase58());
  const provider = new AnchorProvider(connection, signer, {
    preflightCommitment: "confirmed",
  });

  const program = new Program(
    idl as unknown as StakeProgram,
    PROGRAM_ID,
    provider
  );

  //await createNewToken();
  const token1 = await createNewToken();
  const fakeToken1 = await getMint(connection, token1);

  console.log("Fake token 1: ", fakeToken1.address.toBase58());

  const token2 = await createNewToken();
  const fakeToken2 = await getMint(connection, token2);

  console.log("Fake token 2: ", fakeToken2.address.toBase58());

  const [rewardVault1] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward"), fakeToken1.address.toBuffer()],
    program.programId
  );

  const stakeAmount = new BN(100 * 10 ** 9);
  // init program

  let tx = await program.methods
    .initialize()
    .accounts({
      admin: provider.publicKey,
      rewardVault: rewardVault1,
      mint: fakeToken1.address,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Init token 1 tx: ", tx);

  // mint to reawrd vault token account
  const [stakeInfo1] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("stake_info"),
      SIGNER_WALLET.publicKey.toBytes(),
      fakeToken1.address.toBuffer(),
    ],
    program.programId
  );
  const vaultToken1Account = await getOrCreateAssociatedTokenAccount(
    connection,
    SIGNER_WALLET,
    fakeToken1.address,
    stakeInfo1,
    true
  );
  await mintTo(
    connection,
    SIGNER_WALLET,
    fakeToken1.address,
    rewardVault1,
    SIGNER_WALLET.publicKey,
    1000000000 * 10 ** 9
  );

  const stakerToken1Account = getAssociatedTokenAddressSync(
    fakeToken1.address,
    signer.publicKey
  );

  tx = await program.methods
    .stake(stakeAmount)
    .accounts({
      staker: SIGNER_WALLET.publicKey,
      mint: fakeToken1.address,
      stakeInfo: stakeInfo1,
      vaultTokenAccount: vaultToken1Account.address,
      stakerTokenAccount: stakerToken1Account,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Stake token 1 tx: ", tx);

  // unstake token 1
  tx = await program.methods
    .unstake(stakeAmount)
    .accounts({
      staker: signer.publicKey,
      mint: fakeToken1.address,
      stakeInfo: stakeInfo1,
      vaultTokenAccount: vaultToken1Account.address,
      rewardVault: rewardVault1,
      stakerTokenAccount: stakerToken1Account,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Unstake token 1 tx: ", tx);
}

async function createNewToken(): Promise<web3.PublicKey> {
  const mint = await createMint(
    connection,
    SIGNER_WALLET,
    SIGNER_WALLET.publicKey,
    null,
    9
  );

  const faucetTarget = await getOrCreateAssociatedTokenAccount(
    connection,
    SIGNER_WALLET,
    mint,
    SIGNER_WALLET.publicKey
  );

  await mintTo(
    connection,
    SIGNER_WALLET,
    mint,
    faucetTarget.address,
    SIGNER_WALLET.publicKey,
    1000000000 * 10 ** 9
  );

  console.log("Mint address: ", mint.toBase58());
  console.log(
    "Faucet token address successfully created: ",
    faucetTarget.address.toBase58()
  );

  return mint;
}
main()
  .then(() => {
    console.log("Finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
