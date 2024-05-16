"use client";

import useAnchorProvider from "@/hooks/use-anchor-provider";
import TodoProgram from "@/lib/todo-program";
import { DeleteIcon } from "@chakra-ui/icons";
import {
  Checkbox,
  Flex,
  IconButton,
  ListItem,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent } from "react";

export default function TodoItem({
  content,
  completed = false,
  id,
}: {
  content: string;
  completed?: boolean;
  id: number;
}) {
  const provider = useAnchorProvider();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { mutateAsync } = useMutation({
    mutationKey: ["toggle-todo", provider.publicKey, id],
    mutationFn: async () => {
      try {
        const program = new TodoProgram(provider);

        const tx = await program.toggleTodo(id);
        const signature = await provider.sendAndConfirm(tx);

        return signature;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: async (tx) => {
      console.log(tx);

      toast({
        title: "Transaction sent",
        status: "success",
      });

      return queryClient.invalidateQueries({
        queryKey: ["todos", provider.publicKey.toBase58()],
      });
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const { isPending, mutateAsync: mutateDelete } = useMutation({
    mutationKey: ["delete-todo", provider.publicKey, id],
    mutationFn: async () => {
      try {
        const program = new TodoProgram(provider);

        const tx = await program.deleteTodo(id);
        const signature = await provider.sendAndConfirm(tx);

        return signature;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: async (tx) => {
      console.log(tx);

      toast({
        title: "Transaction sent",
        status: "success",
      });

      return queryClient.invalidateQueries({
        queryKey: ["todos", provider.publicKey.toBase58()],
      });
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    mutateAsync();
  };

  const handleDelete = async () => {
    console.log("delete todo", id);
    if (confirm("Are you sure you want to delete this todo?")) {
      mutateDelete();
    }
  };
  return (
    <ListItem borderBottomColor="gray.500" borderBottomWidth="1px" py={4}>
      <Flex alignItems={"center"} justifyContent={"space-between"}>
        <Checkbox
          defaultChecked={completed}
          sx={{
            textDecoration: completed ? "line-through" : "initial",
          }}
          onChange={handleChange}
        >
          {content}
        </Checkbox>
        <IconButton
          disabled={isPending}
          onClick={handleDelete}
          icon={<DeleteIcon color={"red"} />}
          aria-label={"delete todo"}
        />
      </Flex>
    </ListItem>
  );
}
