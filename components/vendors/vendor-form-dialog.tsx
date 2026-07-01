"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import type { ActionResult } from "@/lib/actions/types";
import type { Vendor } from "@/lib/db/types";

type VendorFormDialogProps = {
  vendor?: Vendor;
  action: (formData: FormData) => Promise<ActionResult>;
  triggerLabel?: string;
};

export function VendorFormDialog({
  vendor,
  action,
  triggerLabel,
}: VendorFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(vendor);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(isEdit ? "Vendor updated" : "Vendor created");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant={isEdit ? "outline" : "default"}
          size={isEdit ? "sm" : "default"}
        >
          {triggerLabel ?? (isEdit ? "Edit" : "Add vendor")}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit vendor" : "Add vendor"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update vendor contact details."
              : "Create a new vendor for purchase order routing."}
          </DrawerDescription>
        </DrawerHeader>
        <form action={handleSubmit} className="flex flex-1 flex-col gap-4">
          {vendor ? <input type="hidden" name="id" value={vendor.id} /> : null}
          <div className="grid gap-2">
            <Label htmlFor={`vendor-name-${vendor?.id ?? "new"}`}>Name</Label>
            <Input
              id={`vendor-name-${vendor?.id ?? "new"}`}
              name="name"
              defaultValue={vendor?.name ?? ""}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vendor-contact-${vendor?.id ?? "new"}`}>
              Contact name
            </Label>
            <Input
              id={`vendor-contact-${vendor?.id ?? "new"}`}
              name="contactName"
              defaultValue={vendor?.contactName ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vendor-email-${vendor?.id ?? "new"}`}>Email</Label>
            <Input
              id={`vendor-email-${vendor?.id ?? "new"}`}
              name="email"
              type="email"
              defaultValue={vendor?.email ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vendor-phone-${vendor?.id ?? "new"}`}>Phone</Label>
            <Input
              id={`vendor-phone-${vendor?.id ?? "new"}`}
              name="phone"
              defaultValue={vendor?.phone ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vendor-address-${vendor?.id ?? "new"}`}>
              Address
            </Label>
            <Textarea
              id={`vendor-address-${vendor?.id ?? "new"}`}
              name="address"
              rows={3}
              defaultValue={vendor?.address ?? ""}
            />
          </div>
          <DrawerFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create vendor"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
