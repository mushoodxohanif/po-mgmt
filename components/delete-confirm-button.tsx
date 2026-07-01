"use client";

import { useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { ActionResult } from "@/lib/actions/types";

type DeleteConfirmButtonProps = {
  label?: string;
  title: string;
  description: string;
  action: (formData: FormData) => Promise<ActionResult>;
  id: number;
  idFieldName?: string;
};

export function DeleteConfirmButton({
  label = "Delete",
  title,
  description,
  action,
  id,
  idFieldName = "id",
}: DeleteConfirmButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const formData = new FormData();
    formData.set(idFieldName, String(id));

    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success("Deleted successfully");
      } else {
        toast.error(result.error ?? "Delete failed");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={pending}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
