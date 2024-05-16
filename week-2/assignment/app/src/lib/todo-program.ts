import { AnchorProvider, IdlAccounts, Program, utils } from "@coral-xyz/anchor";
import { TodoApp, IDL } from "../../../target/types/todo_app";
import { Cluster, PublicKey, SystemProgram } from "@solana/web3.js";
import { getProgramId } from "./helper";

export default class TodoProgram {
  program: Program<TodoApp>;
  provider: AnchorProvider;

  constructor(provider: AnchorProvider, cluster: Cluster = "devnet") {
    this.provider = provider;
    this.program = new Program(IDL, getProgramId(cluster), provider);
  }

  createProfile(name: string) {
    const [profile] = PublicKey.findProgramAddressSync(
      [utils.bytes.utf8.encode("profile"), this.provider.publicKey.toBytes()],
      this.program.programId
    );

    const builder = this.program.methods.createProfile(name).accounts({
      creator: this.provider.publicKey,
      profile,
      systemProgram: SystemProgram.programId,
    });

    return builder.transaction();
  }

  fetchProfile() {
    const [profile] = PublicKey.findProgramAddressSync(
      [utils.bytes.utf8.encode("profile"), this.provider.publicKey.toBytes()],
      this.program.programId
    );

    return this.program.account.profile.fetch(profile);
  }

  createTodo(content: string, todoIndex: number) {
    const [profile] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), this.provider.publicKey.toBytes()],
      this.program.programId
    );

    const [todo] = PublicKey.findProgramAddressSync(
      [Buffer.from("todo"), profile.toBytes(), Buffer.from([todoIndex])],
      this.program.programId
    );

    const builder = this.program.methods.createTodo(content).accounts({
      creator: this.provider.publicKey,
      profile,
      todo,
      systemProgram: SystemProgram.programId,
    });

    return builder.transaction();
  }

  async fetchTodos(profile: IdlAccounts<typeof IDL>["profile"]) {
    const todoCount = profile.todoCount;

    const todoPdas: PublicKey[] = [];

    const todoAccounts = await this.program.account.todo.all();

    console.log(todoAccounts);

    for (let i = 0; i < todoCount; i++) {
      const [todo] = PublicKey.findProgramAddressSync(
        [Buffer.from("todo"), profile.key.toBytes(), Buffer.from([i])],
        this.program.programId
      );
      if (todoAccounts.some((account) => account.publicKey.equals(todo))) {
        todoPdas.push(todo);
      }
    }

    return Promise.all(
      todoPdas.map((pda) => this.program.account.todo.fetch(pda))
    );
  }
  toggleTodo(todoId: number) {
    const [profile] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), this.provider.publicKey.toBytes()],
      this.program.programId
    );
    const [todo] = PublicKey.findProgramAddressSync(
      [Buffer.from("todo"), profile.toBytes(), Buffer.from([todoId])],
      this.program.programId
    );

    const builder = this.program.methods.toggleTodo().accounts({
      creator: this.provider.publicKey,
      todo,
    });

    return builder.transaction();
  }

  deleteTodo(todoId: number) {
    const [profile] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), this.provider.publicKey.toBytes()],
      this.program.programId
    );
    const [todo] = PublicKey.findProgramAddressSync(
      [Buffer.from("todo"), profile.toBytes(), Buffer.from([todoId])],
      this.program.programId
    );

    const builder = this.program.methods.deleteTodo().accounts({
      creator: this.provider.publicKey,
      todo,
    });

    return builder.transaction();
  }
}
