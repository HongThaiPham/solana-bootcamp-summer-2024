import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TodoApp } from "../target/types/todo_app";
import { assert, expect } from "chai";
import { withErrorTest } from "./utils";

describe("todo-app-toggle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TodoApp as Program<TodoApp>;
  const name = "Leo Pham";

  const content = "Do Solana bootcamp homework";

  let profile: anchor.web3.PublicKey;
  let editTodo: anchor.web3.PublicKey;

  before(async () => {
    [profile] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), provider.publicKey.toBytes()],
      program.programId
    );

    const tx = await program.methods
      .createProfile(name)
      .accounts({
        creator: provider.publicKey,
        profile,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Create profile success", tx);
  });

  it("Create todo successfully", async () => {
    let profileAccount = await program.account.profile.fetch(profile);
    const currentTodoCount = profileAccount?.todoCount;

    const [todo] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("todo"), profile.toBytes(), Buffer.from([currentTodoCount])],
      program.programId
    );

    const tx = await program.methods
      .createTodo(content)
      .accounts({
        creator: provider.publicKey,
        profile,
        todo,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Your transaction signature", tx);
    const todoAccount = await program.account.todo.fetch(todo);
    editTodo = todo;

    expect(todoAccount.content).to.equal(content);
    expect(todoAccount.profile.toBase58()).to.equal(profile.toBase58());
    expect(todoAccount.completed).to.equal(false);

    profileAccount = await program.account.profile.fetch(profile);
    expect(profileAccount.todoCount).to.equal(currentTodoCount + 1);
  });

  it("Toggle todo successfully", async () => {
    let todoAccount = await program.account.todo.fetch(editTodo);
    const currentStatus = todoAccount.completed;

    const tx = await program.methods
      .toggleTodo()
      .accounts({
        creator: provider.publicKey,
        todo: editTodo,
      })
      .rpc();

    console.log("Your transaction signature", tx);
    todoAccount = await program.account.todo.fetch(editTodo);

    expect(todoAccount.completed).to.equal(!currentStatus);
  });

  it("Toggle todo failed by providing invalid creator", async () => {
    const anotherPayer = anchor.web3.Keypair.generate();

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        anotherPayer.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      )
    );

    console.log("anotherPayer", anotherPayer.publicKey.toBase58());

    withErrorTest(async () => {
      try {
        let todoAccount = await program.account.todo.fetch(editTodo);
        const currentStatus = todoAccount.completed;

        const tx = await program.methods
          .toggleTodo()
          .accounts({
            creator: anotherPayer.publicKey,
            todo: editTodo,
          })
          .signers([anotherPayer])
          .rpc();

        console.log("Your transaction signature", tx);
        expect(todoAccount.completed).to.equal(currentStatus);

        assert.ok(false);
      } catch (_err) {
        // console.log(_err);
        assert.isTrue(_err instanceof anchor.AnchorError);
        const err: anchor.AnchorError = _err;
        assert.strictEqual(err.error.errorMessage, "Invalid authority");
        assert.strictEqual(err.error.errorCode.number, 6002);
        assert.strictEqual(err.error.errorCode.code, "InvalidAuthority");
        assert.strictEqual(
          err.program.toString(),
          program.programId.toString()
        );
      }
    });
  });

  it("Delete todo successfully", async () => {
    const tx = await program.methods
      .deleteTodo()
      .accounts({ todo: editTodo })
      .rpc();

    console.log("Your transaction signature", tx);
    withErrorTest(async () => {
      await program.account.todo.fetch(editTodo);
      assert.ok(false);
    });
  });
});
