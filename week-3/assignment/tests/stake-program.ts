import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { StakeProgram } from "../target/types/stake_program";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { assert, expect } from "chai";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe("stake-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.StakeProgram as Program<StakeProgram>;
  const provider = anchor.getProvider();

  const staker = anchor.web3.Keypair.generate();
  let stakerTokenAccount: anchor.web3.PublicKey;

  // USDC-fake mint
  const usdcMintKp = anchor.web3.Keypair.generate();
  let rewardVault: anchor.web3.PublicKey;
  let stakeInfo: anchor.web3.PublicKey;

  before(async () => {
    // init staker
    {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(
          staker.publicKey,
          anchor.web3.LAMPORTS_PER_SOL
        )
      );
    }
    // create USDC-fake mint
    {
      const tx = new anchor.web3.Transaction();

      const lamports = await getMinimumBalanceForRentExemptMint(
        provider.connection
      );

      const createMintIx = anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.publicKey,
        newAccountPubkey: usdcMintKp.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      });

      const initMintIx = createInitializeMint2Instruction(
        usdcMintKp.publicKey,
        6,
        provider.publicKey,
        provider.publicKey,
        TOKEN_PROGRAM_ID
      );

      stakerTokenAccount = getAssociatedTokenAddressSync(
        usdcMintKp.publicKey,
        staker.publicKey
      );

      const createStakerTokenAccountIx =
        createAssociatedTokenAccountInstruction(
          staker.publicKey,
          stakerTokenAccount,
          staker.publicKey,
          usdcMintKp.publicKey
        );

      const mintToStakerIx = createMintToInstruction(
        usdcMintKp.publicKey,
        stakerTokenAccount,
        provider.publicKey,
        1000 * 10 ** 6,
        []
      );

      tx.add(
        ...[
          createMintIx,
          initMintIx,
          createStakerTokenAccountIx,
          mintToStakerIx,
        ]
      );

      const ts = await provider.sendAndConfirm(tx, [usdcMintKp, staker]);

      console.log("Your transaction signature", ts);
    }

    rewardVault = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reward"), usdcMintKp.publicKey.toBuffer()],
      program.programId
    )[0];
  });

  it("Is initialized!", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        admin: provider.publicKey,
        rewardVault: rewardVault,
        mint: usdcMintKp.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Your transaction signature", tx);

    const rewardVaultAccount = await getAccount(
      provider.connection,
      rewardVault
    );

    expect(rewardVaultAccount.address.toBase58()).to.equal(
      rewardVault.toBase58()
    );
    expect(Number(rewardVaultAccount.amount)).to.equal(0);
  });

  it("Stake successfully", async () => {
    stakeInfo = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake_info"),
        staker.publicKey.toBytes(),
        usdcMintKp.publicKey.toBuffer(),
      ],
      program.programId
    )[0];

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      usdcMintKp.publicKey,
      stakeInfo,
      true
    );

    const stakeAmount = new BN(100 * 10 ** 6);

    const tx = await program.methods
      .stake(stakeAmount)
      .accounts({
        staker: staker.publicKey,
        mint: usdcMintKp.publicKey,
        stakeInfo: stakeInfo,
        vaultTokenAccount: vaultTokenAccount,
        stakerTokenAccount: stakerTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([staker])
      .rpc();

    console.log("Your transaction signature", tx);

    const stakeInfoAccount = await program.account.stakeInfo.fetch(stakeInfo);

    expect(stakeInfoAccount.staker.toBase58()).to.equal(
      staker.publicKey.toBase58()
    );
    expect(stakeInfoAccount.mint.toBase58()).to.equal(
      usdcMintKp.publicKey.toBase58()
    );
    expect(stakeInfoAccount.isStaked).to.equal(true);
    expect(stakeInfoAccount.amount.toString()).to.equal(stakeAmount.toString());

    const stakerAccount = await getAccount(
      provider.connection,
      stakerTokenAccount
    );

    const vaultAccount = await getAccount(
      provider.connection,
      vaultTokenAccount
    );

    expect(stakerAccount.amount.toString()).to.equal(String(900 * 10 ** 6));
    expect(vaultAccount.amount.toString()).to.equal(String(100 * 10 ** 6));
  });

  // it("Unstake successfully", async () => {
  //   await delay(5000);
  //   const stakeAmount = new BN(100 * 10 ** 6);
  //   // mint reward token to reward vault
  //   const mintTx = new anchor.web3.Transaction();

  //   const mintToRewardVaultIx = createMintToInstruction(
  //     usdcMintKp.publicKey,
  //     rewardVault,
  //     provider.publicKey,
  //     1000 * 10 ** 6,
  //     []
  //   );

  //   mintTx.add(mintToRewardVaultIx);

  //   await provider.sendAndConfirm(mintTx);

  //   const vaultTokenAccount = getAssociatedTokenAddressSync(
  //     usdcMintKp.publicKey,
  //     stakeInfo,
  //     true
  //   );

  //   const tx = await program.methods
  //     .unstake(stakeAmount)
  //     .accounts({
  //       staker: staker.publicKey,
  //       mint: usdcMintKp.publicKey,
  //       stakeInfo: stakeInfo,
  //       vaultTokenAccount: vaultTokenAccount,
  //       rewardVault: rewardVault,
  //       stakerTokenAccount: stakerTokenAccount,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //     })
  //     .signers([staker])
  //     .rpc();

  //   console.log("Your transaction signature", tx);

  //   try {
  //     await program.account.stakeInfo.fetch(stakeInfo);
  //   } catch (error) {
  //     assert.strictEqual(
  //       error.message,
  //       `Account does not exist or has no data ${stakeInfo.toBase58()}`
  //     );
  //   }

  //   const stakerAccount = await getAccount(
  //     provider.connection,
  //     stakerTokenAccount
  //   );

  //   const rewardVaultAccount = await getAccount(
  //     provider.connection,
  //     rewardVault
  //   );
  //   try {
  //     const vaultAccount = await getAccount(
  //       provider.connection,
  //       vaultTokenAccount
  //     );
  //     expect(Number(vaultAccount.amount)).to.equal(0);
  //   } catch (error) {
  //     assert.strictEqual(error.message, ``);
  //   }

  //   expect(Number(stakerAccount.amount)).to.greaterThan(1000 * 10 ** 6);

  //   expect(Number(rewardVaultAccount.amount)).to.lessThan(1000 * 10 ** 6);
  // });

  it("Unstake portion of USDT successfully", async () => {
    await delay(5000);
    const stakeAmount = new BN(100 * 10 ** 6);
    // mint reward token to reward vault
    const mintTx = new anchor.web3.Transaction();

    const mintToRewardVaultIx = createMintToInstruction(
      usdcMintKp.publicKey,
      rewardVault,
      provider.publicKey,
      1000 * 10 ** 6,
      []
    );

    mintTx.add(mintToRewardVaultIx);

    await provider.sendAndConfirm(mintTx);

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      usdcMintKp.publicKey,
      stakeInfo,
      true
    );
    const unstakeAmount1 = stakeAmount.mul(new BN(30)).div(new BN(100));
    const unstakeAmount2 = stakeAmount.mul(new BN(70)).div(new BN(100));
    let tx = await program.methods
      .unstake(unstakeAmount1)
      .accounts({
        staker: staker.publicKey,
        mint: usdcMintKp.publicKey,
        stakeInfo: stakeInfo,
        vaultTokenAccount: vaultTokenAccount,
        rewardVault: rewardVault,
        stakerTokenAccount: stakerTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([staker])
      .rpc();

    console.log("Your transaction signature", tx);

    const stakeInfoAccount = await program.account.stakeInfo.fetch(stakeInfo);

    expect(stakeInfoAccount.isStaked).to.equal(true);
    expect(Number(stakeInfoAccount.amount)).to.equal(unstakeAmount2.toNumber());

    const vaultAccount = await getAccount(
      provider.connection,
      vaultTokenAccount
    );
    expect(Number(vaultAccount.amount)).to.equal(Number(unstakeAmount2));

    tx = await program.methods
      .unstake(unstakeAmount2)
      .accounts({
        staker: staker.publicKey,
        mint: usdcMintKp.publicKey,
        stakeInfo: stakeInfo,
        vaultTokenAccount: vaultTokenAccount,
        rewardVault: rewardVault,
        stakerTokenAccount: stakerTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([staker])
      .rpc();

    console.log("Your transaction signature", tx);

    try {
      await program.account.stakeInfo.fetch(stakeInfo);
    } catch (error) {
      assert.strictEqual(
        error.message,
        `Account does not exist or has no data ${stakeInfo.toBase58()}`
      );
    }

    try {
      const vaultAccount = await getAccount(
        provider.connection,
        vaultTokenAccount
      );
      expect(Number(vaultAccount.amount)).to.equal(0);
    } catch (error) {
      assert.strictEqual(error.message, ``);
    }

    const stakerAccount = await getAccount(
      provider.connection,
      stakerTokenAccount
    );

    const rewardVaultAccount = await getAccount(
      provider.connection,
      rewardVault
    );
    expect(Number(stakerAccount.amount)).to.greaterThan(1000 * 10 ** 6);

    expect(Number(rewardVaultAccount.amount)).to.lessThan(1000 * 10 ** 6);
  });
});
