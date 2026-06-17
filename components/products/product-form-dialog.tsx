"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/types";
import type { Product } from "@/lib/db/schema";

type ProductFormDialogProps = {
  product?: Product;
  action: (formData: FormData) => Promise<ActionResult>;
  triggerLabel?: string;
};

export function ProductFormDialog({
  product,
  action,
  triggerLabel,
}: ProductFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(product);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(isEdit ? "Product updated" : "Product created");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isEdit ? "outline" : "default"}
          size={isEdit ? "sm" : "default"}
        >
          {triggerLabel ?? (isEdit ? "Edit" : "Add product")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update product identifiers."
              : "Create a product manually, then add its BOM by uploading an Excel file."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          {product ? (
            <input type="hidden" name="id" value={product.id} />
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor={`product-model-${product?.id ?? "new"}`}>
              Model code
            </Label>
            <Input
              id={`product-model-${product?.id ?? "new"}`}
              name="modelCode"
              defaultValue={product?.modelCode ?? ""}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`product-name-${product?.id ?? "new"}`}>
              Display name
            </Label>
            <Input
              id={`product-name-${product?.id ?? "new"}`}
              name="displayName"
              defaultValue={product?.displayName ?? ""}
              required
            />
          </div>
          <DialogFooter className="px-0 pb-0">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
