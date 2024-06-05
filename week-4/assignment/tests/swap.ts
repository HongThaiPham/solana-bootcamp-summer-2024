import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { assert } from "chai";
import {
  ASSOCIATED_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@coral-xyz/anchor/dist/cjs/utils/token";
import { mintToken } from "./utils";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";

// @ts-ignore
BN.prototype.sqrt = function sqrt() {
  var z = new BN(0);
  if (this.gt(new BN(3))) {
    z = this;
    var x = this.div(new BN(2)).add(new BN(1));
    while (x.lt(z)) {
      z = x;
      x = this.div(x).add(x).div(new BN(2));
    }
  } else if (!this.eq(new BN(0))) {
    z = new BN(1);
  }
  return z;
};

describe("swap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Amm as Program<Amm>;

  const depositor = anchor.web3.Keypair.generate();
  const depositor2 = anchor.web3.Keypair.generate();
  let id: anchor.web3.PublicKey;
  let fee = 100;

  let ammPda: anchor.web3.PublicKey;

  let mintAKp: anchor.web3.Keypair;
  const mintADecimals = 0;
  let mintBKp: anchor.web3.Keypair;
  const mintBDecimals = 0;

  let poolPda: anchor.web3.PublicKey;
  let poolAuthorityPda: anchor.web3.PublicKey;

  let mintLiquidityPda: anchor.web3.PublicKey;

  let poolAccountA: anchor.web3.PublicKey;
  let poolAccountB: anchor.web3.PublicKey;

  let depisitorMintAAccount: anchor.web3.PublicKey;
  let depisitorMintBAccount: anchor.web3.PublicKey;
  let depisitorLPAccount: anchor.web3.PublicKey;

  let depisitor2MintAAccount: anchor.web3.PublicKey;
  let depisitor2MintBAccount: anchor.web3.PublicKey;
  let depisitor2LPAccount: anchor.web3.PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        depositor.publicKey,
        anchor.web3.LAMPORTS_PER_SOL * 2
      )
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        depositor2.publicKey,
        anchor.web3.LAMPORTS_PER_SOL * 2
      )
    );

    id = anchor.web3.Keypair.generate().publicKey;

    ammPda = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("amm"), id.toBuffer()],
      program.programId
    )[0];

    const createAmmTx = await program.methods
      .createAmm(id, fee)
      .accounts({
        amm: ammPda,
        admin: provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Create AMM success signature", createAmmTx);

    mintAKp = anchor.web3.Keypair.generate();
    mintBKp = anchor.web3.Keypair.generate();

    await mintToken({
      connection: provider.connection,
      payer: depositor,
      receiver: depositor.publicKey,
      mint: mintAKp,
      decimals: mintADecimals,
      amount: 10000,
    });

    await mintToken({
      connection: provider.connection,
      payer: depositor,
      receiver: depositor.publicKey,
      mint: mintBKp,
      decimals: mintBDecimals,
      amount: 20000,
    });

    // add another depositor

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      depositor2,
      mintAKp.publicKey,
      depositor2.publicKey
    );

    await mintTo(
      provider.connection,
      depositor,
      mintAKp.publicKey,
      getAssociatedTokenAddressSync(mintAKp.publicKey, depositor2.publicKey),
      depositor,
      10000 * 10 ** mintADecimals
    );

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      depositor2,
      mintBKp.publicKey,
      depositor2.publicKey
    );

    await mintTo(
      provider.connection,
      depositor,
      mintBKp.publicKey,
      getAssociatedTokenAddressSync(mintBKp.publicKey, depositor2.publicKey),
      depositor,
      20000 * 10 ** mintBDecimals
    );

    poolPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        ammPda.toBuffer(),
        mintAKp.publicKey.toBuffer(),
        mintBKp.publicKey.toBuffer(),
      ],
      program.programId
    )[0];

    poolAuthorityPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        ammPda.toBuffer(),
        mintAKp.publicKey.toBuffer(),
        mintBKp.publicKey.toBuffer(),
        Buffer.from("authority"),
      ],
      program.programId
    )[0];

    mintLiquidityPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        ammPda.toBuffer(),
        mintAKp.publicKey.toBuffer(),
        mintBKp.publicKey.toBuffer(),
        Buffer.from("mint_liquidity"),
      ],
      program.programId
    )[0];

    poolAccountA = getAssociatedTokenAddressSync(
      mintAKp.publicKey,
      poolAuthorityPda,
      true
    );

    poolAccountB = getAssociatedTokenAddressSync(
      mintBKp.publicKey,
      poolAuthorityPda,
      true
    );

    const createPoolTx = await program.methods
      .createPool()
      .accounts({
        pool: poolPda,
        poolAuthority: poolAuthorityPda,
        mintLiquidity: mintLiquidityPda,
        amm: ammPda,
        mintA: mintAKp.publicKey,
        mintB: mintBKp.publicKey,
        poolAccountA: poolAccountA,
        poolAccountB: poolAccountB,
        payer: provider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Create pool success signature", createPoolTx);

    depisitorLPAccount = getAssociatedTokenAddressSync(
      mintLiquidityPda,
      depositor.publicKey,
      true
    );

    depisitorMintAAccount = getAssociatedTokenAddressSync(
      mintAKp.publicKey,
      depositor.publicKey,
      false
    );

    depisitorMintBAccount = getAssociatedTokenAddressSync(
      mintBKp.publicKey,
      depositor.publicKey,
      false
    );

    depisitor2LPAccount = getAssociatedTokenAddressSync(
      mintLiquidityPda,
      depositor2.publicKey,
      true
    );

    depisitor2MintAAccount = getAssociatedTokenAddressSync(
      mintAKp.publicKey,
      depositor2.publicKey,
      false
    );

    depisitor2MintBAccount = getAssociatedTokenAddressSync(
      mintBKp.publicKey,
      depositor2.publicKey,
      false
    );
  });

  it("deposit-liquidity - 1", async () => {
    const amountA = new BN(100 * 10 ** mintADecimals);
    const amountB = new BN(200 * 10 ** mintBDecimals);

    const tx = await program.methods
      .depositLiquidity(amountA, amountB)
      .accounts({
        pool: poolPda,
        poolAuthority: poolAuthorityPda,
        mintLiquidity: mintLiquidityPda,
        mintA: mintAKp.publicKey,
        mintB: mintBKp.publicKey,
        poolAccountA: poolAccountA,
        poolAccountB: poolAccountB,
        depositorAccountLiquidity: depisitorLPAccount,
        depositorAccountA: depisitorMintAAccount,
        depositorAccountB: depisitorMintBAccount,
        depositor: depositor.publicKey,

        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    console.log("Your transaction signature", tx);

    assert(1 == 1, "ngon");

    const poolATokenAccount = await getAccount(
      provider.connection,
      poolAccountA
    );

    const poolBTokenAccount = await getAccount(
      provider.connection,
      poolAccountB
    );

    const depisitorLP = await getAccount(
      provider.connection,
      depisitorLPAccount
    );

    assert(
      poolATokenAccount.amount.toString() == amountA.toString(),
      "Correct token A"
    );

    assert(
      poolBTokenAccount.amount.toString() == amountB.toString(),
      "Correct token B"
    );

    assert(depisitorLP.amount > 0, "Correct LP");
  });

  it.skip("deposit-liquidity - 2", async () => {
    const amountA = new BN(100 * 10 ** mintADecimals);
    const amountB = new BN(200 * 10 ** mintBDecimals);

    const tx = await program.methods
      .depositLiquidity(amountA, amountB)
      .accounts({
        pool: poolPda,
        poolAuthority: poolAuthorityPda,
        mintLiquidity: mintLiquidityPda,
        mintA: mintAKp.publicKey,
        mintB: mintBKp.publicKey,
        poolAccountA: poolAccountA,
        poolAccountB: poolAccountB,
        depositorAccountLiquidity: depisitor2LPAccount,
        depositorAccountA: depisitor2MintAAccount,
        depositorAccountB: depisitor2MintBAccount,
        depositor: depositor2.publicKey,

        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([depositor2])
      .rpc();

    console.log("Your transaction signature", tx);
  });

  it("swap a to b", async () => {
    const trader = depositor2;
    const amount = new BN(10 * 10 ** mintADecimals);
    const poolATokenAccount = await getAccount(
      provider.connection,
      poolAccountA
    );

    const poolBTokenAccount = await getAccount(
      provider.connection,
      poolAccountB
    );

    const mint_output_amount = amount
      .mul(new BN(poolBTokenAccount.amount.toString()))
      .div(new BN(poolATokenAccount.amount.toString()));
    const tx = await program.methods
      .swap(true, amount, mint_output_amount)
      .accounts({
        pool: poolPda,
        poolAuthority: poolAuthorityPda,
        mintA: mintAKp.publicKey,
        mintB: mintBKp.publicKey,
        poolAccountA: poolAccountA,
        poolAccountB: poolAccountB,
        traderAccountA: depisitor2MintAAccount,
        traderAccountB: depisitor2MintBAccount,
        trader: trader.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    console.log("Your transaction signature", tx);
  });

  it("swap b to a", async () => {
    const trader = depositor2;
    const amount = new BN(10 * 10 ** mintADecimals);
    const poolATokenAccount = await getAccount(
      provider.connection,
      poolAccountA
    );

    const poolBTokenAccount = await getAccount(
      provider.connection,
      poolAccountB
    );

    const mint_output_amount = amount
      .mul(new BN(poolATokenAccount.amount.toString()))
      .div(new BN(poolBTokenAccount.amount.toString()));
    const tx = await program.methods
      .swap(false, amount, mint_output_amount)
      .accounts({
        pool: poolPda,
        poolAuthority: poolAuthorityPda,
        mintA: mintAKp.publicKey,
        mintB: mintBKp.publicKey,
        poolAccountA: poolAccountA,
        poolAccountB: poolAccountB,
        traderAccountA: depisitor2MintAAccount,
        traderAccountB: depisitor2MintBAccount,
        trader: trader.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    console.log("Your transaction signature", tx);
  });
});
