"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  PartSpecsEditor,
  PartSpecsEditorHiddenFields,
} from "@/components/parts/part-specs-editor";
import { VendorMultiSelect } from "@/components/parts/vendor-multi-select";
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
import { Textarea } from "@/components/ui/textarea";
import type { VendorOptionForPart } from "@/lib/actions/parts";
import type { ActionResult } from "@/lib/actions/types";
import type { CatalogImageBlobUploadMode } from "@/lib/catalog-image-shared";
import type { Part, PartSpecs } from "@/lib/db/types";
import {
  inferPartCategory,
  type PartCategory,
} from "@/lib/services/part-specs";

type PartFormDialogProps = {
  part?: Pick<
    Part,
    "id" | "name" | "category" | "specs" | "description" | "imageUrls"
  >;
  availableVendors?: VendorOptionForPart[];
  assignedVendorIds?: number[];
  imageUploadMode: CatalogImageBlobUploadMode;
  action: (formData: FormData) => Promise<ActionResult>;
  triggerLabel?: string;
};

export function PartFormDialog({
  part,
  availableVendors = [],
  assignedVendorIds = [],
  imageUploadMode,
  action,
  triggerLabel,
}: PartFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formResetKey, setFormResetKey] = useState(0);
  const isEdit = Boolean(part);

  const [category, setCategory] = useState<PartCategory>(
    (part?.category as PartCategory | null) ??
      (part?.name ? inferPartCategory(part.name) : "generic"),
  );
  const [specs, setSpecs] = useState<PartSpecs>(part?.specs ?? {});

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(isEdit ? "Part updated" : "Part created");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setCategory(
        (part?.category as PartCategory | null) ??
          (part?.name ? inferPartCategory(part.name) : "generic"),
      );
      setSpecs(part?.specs ?? {});
      setFormResetKey((key) => key + 1);
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
          {triggerLabel ?? (isEdit ? "Edit" : "Add part")}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit part" : "Add part"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update part details and specifications."
              : "Add a new part to the catalog."}
          </DrawerDescription>
        </DrawerHeader>
        <form action={handleSubmit} className="flex flex-1 flex-col gap-4">
          {part ? <input type="hidden" name="id" value={part.id} /> : null}
          <PartSpecsEditorHiddenFields category={category} specs={specs} />

          <div className="grid gap-2">
            <Label htmlFor={`part-name-${part?.id ?? "new"}`}>Name</Label>
            <Input
              id={`part-name-${part?.id ?? "new"}`}
              name="name"
              defaultValue={part?.name ?? ""}
              required
            />
          </div>

          <PartSpecsEditor
            name={part?.name ?? ""}
            category={category}
            specs={specs}
            onCategoryChange={setCategory}
            onSpecsChange={setSpecs}
          />

          <div className="grid gap-2">
            <Label htmlFor={`part-description-${part?.id ?? "new"}`}>
              Notes
            </Label>
            <Textarea
              id={`part-description-${part?.id ?? "new"}`}
              name="description"
              rows={3}
              placeholder="Optional freeform notes or unparsed details"
              defaultValue={part?.description ?? ""}
            />
          </div>

          <Fragment key={formResetKey}>
            <VendorMultiSelect
              vendors={availableVendors}
              assignedVendorIds={assignedVendorIds}
              disabled={pending}
            />

            <ImageAttachmentsEditor
              entityType="parts"
              uploadMode={imageUploadMode}
              initialUrls={part?.imageUrls ?? []}
              disabled={pending}
            />
          </Fragment>

          <DrawerFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create part"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
