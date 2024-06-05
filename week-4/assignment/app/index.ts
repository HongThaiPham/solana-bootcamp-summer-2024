import { AnchorProvider, BN, Program, Wallet, web3 } from "@coral-xyz/anchor";
import dotenv from "dotenv";
import { Amm } from "../target/types/amm";
dotenv.config();

import idl from "../target/idl/amm.json";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID as ASSOCIATED_PROGRAM_ID,
  Mint,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const SIGNER_WALLET = web3.Keypair.fromSecretKey(
  new Uint8Array(process.env.MY_TEST_WALLET!.split(",").map((s) => parseInt(s)))
);

const TRADER_WALLET = web3.Keypair.fromSecretKey(
  new Uint8Array(bs58.decode(process.env.MY_TEST_TRADER!))
);
const PROGRAM_ID = new web3.PublicKey(
  "6NAYr9BDQ4Zjo9mRkBBtibijVJ2ti5nRR8Z8whaYvUBr"
);
const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
const signer = new Wallet(SIGNER_WALLET);
console.log("Signer wallet address: ", signer.publicKey.toBase58());
const provider = new AnchorProvider(connection, signer, {
  preflightCommitment: "confirmed",
});

const program = new Program(idl as unknown as Amm, PROGRAM_ID, provider);
let fee = 100;
let tx;
async function main() {
  console.info("Creating new token A and token B");
  const depositor = SIGNER_WALLET;
  const mintAKp = await createNewToken();
  delay(1000);
  const mintBKp = await createNewToken();
  delay(1000);
  await getOrCreateAssociatedTokenAccount(
    provider.connection,
    TRADER_WALLET,
    mintAKp.address,
    TRADER_WALLET.publicKey
  );
  delay(1000);
  await mintTo(
    provider.connection,
    depositor,
    mintAKp.address,
    getAssociatedTokenAddressSync(mintAKp.address, TRADER_WALLET.publicKey),
    depositor,
    10000 * 10 ** mintAKp.decimals
  );
  delay(1000);
  await getOrCreateAssociatedTokenAccount(
    provider.connection,
    TRADER_WALLET,
    mintBKp.address,
    TRADER_WALLET.publicKey
  );
  delay(1000);
  await mintTo(
    provider.connection,
    depositor,
    mintBKp.address,
    getAssociatedTokenAddressSync(mintBKp.address, TRADER_WALLET.publicKey),
    depositor,
    20000 * 10 ** mintBKp.decimals
  );
  delay(1000);
  console.info("Creating AMM and Pool");

  const id = web3.Keypair.generate().publicKey;

  const [ammPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("amm"), id.toBuffer()],
    program.programId
  );

  const createAmmTx = await program.methods
    .createAmm(id, fee)
    .accounts({
      amm: ammPda,
      admin: provider.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Create AMM success signature", createAmmTx);

  const [poolPda] = web3.PublicKey.findProgramAddressSync(
    [ammPda.toBuffer(), mintAKp.address.toBuffer(), mintBKp.address.toBuffer()],
    program.programId
  );

  const [poolAuthorityPda] = web3.PublicKey.findProgramAddressSync(
    [
      ammPda.toBuffer(),
      mintAKp.address.toBuffer(),
      mintBKp.address.toBuffer(),
      Buffer.from("authority"),
    ],
    program.programId
  );

  const [mintLiquidityPda] = web3.PublicKey.findProgramAddressSync(
    [
      ammPda.toBuffer(),
      mintAKp.address.toBuffer(),
      mintBKp.address.toBuffer(),
      Buffer.from("mint_liquidity"),
    ],
    program.programId
  );

  const poolAccountA = getAssociatedTokenAddressSync(
    mintAKp.address,
    poolAuthorityPda,
    true
  );

  const poolAccountB = getAssociatedTokenAddressSync(
    mintBKp.address,
    poolAuthorityPda,
    true
  );

  delay(3000);

  console.info("Creating pool");

  const createPoolTx = await program.methods
    .createPool()
    .accounts({
      pool: poolPda,
      poolAuthority: poolAuthorityPda,
      mintLiquidity: mintLiquidityPda,
      amm: ammPda,
      mintA: mintAKp.address,
      mintB: mintBKp.address,
      poolAccountA: poolAccountA,
      poolAccountB: poolAccountB,
      payer: provider.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Create pool success signature", createPoolTx);

  const depisitorLPAccount = getAssociatedTokenAddressSync(
    mintLiquidityPda,
    depositor.publicKey,
    true
  );

  const depisitorMintAAccount = getAssociatedTokenAddressSync(
    mintAKp.address,
    depositor.publicKey,
    false
  );

  const depisitorMintBAccount = getAssociatedTokenAddressSync(
    mintBKp.address,
    depositor.publicKey,
    false
  );

  const traderLPAccount = getAssociatedTokenAddressSync(
    mintLiquidityPda,
    TRADER_WALLET.publicKey,
    true
  );

  const traderMintAAccount = getAssociatedTokenAddressSync(
    mintAKp.address,
    TRADER_WALLET.publicKey,
    false
  );

  const traderMintBAccount = getAssociatedTokenAddressSync(
    mintBKp.address,
    TRADER_WALLET.publicKey,
    false
  );
  delay(3000);
  console.info("Depositing liquidity");

  const amountA = new BN(100 * 10 ** mintAKp.decimals);
  const amountB = new BN(200 * 10 ** mintAKp.decimals);

  tx = await program.methods
    .depositLiquidity(amountA, amountB)
    .accounts({
      pool: poolPda,
      poolAuthority: poolAuthorityPda,
      mintLiquidity: mintLiquidityPda,
      mintA: mintAKp.address,
      mintB: mintBKp.address,
      poolAccountA: poolAccountA,
      poolAccountB: poolAccountB,
      depositorAccountLiquidity: depisitorLPAccount,
      depositorAccountA: depisitorMintAAccount,
      depositorAccountB: depisitorMintBAccount,
      depositor: depositor.publicKey,

      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([depositor])
    .rpc();

  console.log("Your transaction signature", tx);

  delay(5000);
  console.info("Swapping tokens A to B");

  const swapAmountA = new BN(10 * 10 ** mintAKp.decimals);
  let poolATokenAccount = await getAccount(provider.connection, poolAccountA);

  let poolBTokenAccount = await getAccount(provider.connection, poolAccountB);

  let mint_output_amount = swapAmountA
    .mul(new BN(poolBTokenAccount.amount.toString()))
    .div(new BN(poolATokenAccount.amount.toString()));
  tx = await program.methods
    .swap(true, swapAmountA, mint_output_amount)
    .accounts({
      pool: poolPda,
      poolAuthority: poolAuthorityPda,
      mintA: mintAKp.address,
      mintB: mintBKp.address,
      poolAccountA: poolAccountA,
      poolAccountB: poolAccountB,
      traderAccountA: traderMintAAccount,
      traderAccountB: traderMintBAccount,
      trader: TRADER_WALLET.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([TRADER_WALLET])
    .rpc();

  console.log("Your transaction signature", tx);

  delay(5000);
  console.info("Swapping tokens B to A");

  const swapAmountB = new BN(10 * 10 ** mintBKp.decimals);
  poolATokenAccount = await getAccount(provider.connection, poolAccountA);

  poolBTokenAccount = await getAccount(provider.connection, poolAccountB);

  mint_output_amount = swapAmountB
    .mul(new BN(poolATokenAccount.amount.toString()))
    .div(new BN(poolBTokenAccount.amount.toString()));
  tx = await program.methods
    .swap(false, swapAmountB, mint_output_amount)
    .accounts({
      pool: poolPda,
      poolAuthority: poolAuthorityPda,
      mintA: mintAKp.address,
      mintB: mintBKp.address,
      poolAccountA: poolAccountA,
      poolAccountB: poolAccountB,
      traderAccountA: traderMintAAccount,
      traderAccountB: traderMintBAccount,
      trader: TRADER_WALLET.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([TRADER_WALLET])
    .rpc();

  console.log("Your transaction signature", tx);

  delay(5000);
  console.info("Withdrawing liquidity");

  const depisitorLP = await getAccount(provider.connection, depisitorLPAccount);

  tx = await program.methods
    .withdrawLiquidity(new BN(depisitorLP.amount.toString()))
    .accounts({
      pool: poolPda,
      poolAuthority: poolAuthorityPda,
      mintLiquidity: mintLiquidityPda,
      mintA: mintAKp.address,
      mintB: mintBKp.address,
      poolAccountA: poolAccountA,
      poolAccountB: poolAccountB,
      depositorAccountLiquidity: depisitorLPAccount,
      depositorAccountA: depisitorMintAAccount,
      depositorAccountB: depisitorMintBAccount,
      depositor: depositor.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([depositor])
    .rpc();

  console.log("Your transaction signature", tx);
}

async function createNewToken(): Promise<Mint> {
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

  const minInfo = await getMint(connection, mint);

  return minInfo;
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
