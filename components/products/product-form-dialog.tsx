"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PartMultiSelect } from "@/components/products/part-multi-select";
import { ImageAttachmentsEditor } from "@/components/shared/image-attachments-editor";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PartOptionForProduct } from "@/lib/actions/products";
import type { ActionResult } from "@/lib/actions/types";
import type { Product } from "@/lib/db/schema";
import type { CatalogImageBlobUploadMode } from "@/lib/storage/catalog-image-blob";

type ProductFormDialogProps = {
  product?: Pick<Product, "id" | "modelCode" | "displayName" | "imageUrls">;
  availableParts?: PartOptionForProduct[];
  existingPartIds?: number[];
  imageUploadMode: CatalogImageBlobUploadMode;
  action: (formData: FormData) => Promise<ActionResult>;
  triggerLabel?: string;
};

export function ProductFormDialog({
  product,
  availableParts = [],
  existingPartIds = [],
  imageUploadMode,
  action,
  triggerLabel,
}: ProductFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [imageEditorKey, setImageEditorKey] = useState(0);
  const isEdit = Boolean(product);
  const existingPartIdSet = new Set(existingPartIds);
  const selectableParts = isEdit
    ? availableParts.filter((part) => !existingPartIdSet.has(part.id))
    : availableParts;
  const showPartSelect = !isEdit || availableParts.length > 0;

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

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setImageEditorKey((key) => key + 1);
    }
    setOpen(nextOpen);
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant={isEdit ? "outline" : "default"}
          size={isEdit ? "sm" : "default"}
        >
          {triggerLabel ?? (isEdit ? "Edit" : "Add product")}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit product" : "Add product"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update product identifiers and add parts to the bill of materials."
              : "Create a product and select the parts that make it up."}
          </DrawerDescription>
        </DrawerHeader>
        <form action={handleSubmit} className="flex flex-1 flex-col gap-4">
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
              disabled={pending}
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
              disabled={pending}
            />
          </div>
          {showPartSelect ? (
            <PartMultiSelect
              parts={selectableParts}
              disabled={pending}
              label={isEdit ? "Add parts" : undefined}
              description={
                isEdit
                  ? "Select additional parts to add to this product. Each part is supplied by one or more vendors."
                  : undefined
              }
              emptyMessage={
                isEdit
                  ? "All catalog parts are already on this product's BOM."
                  : undefined
              }
            />
          ) : null}
          <ImageAttachmentsEditor
            key={imageEditorKey}
            entityType="products"
            uploadMode={imageUploadMode}
            initialUrls={product?.imageUrls ?? []}
            disabled={pending}
          />
          <DrawerFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
