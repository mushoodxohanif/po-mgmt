"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/types";
import type { ImportSummary } from "@/lib/services/sku-import";

type UploadSkuFilesButtonProps = {
  action: (
    formData: FormData,
  ) => Promise<
    ActionResult & { summary?: ImportSummary; summaryText?: string }
  >;
};

export function UploadSkuFilesButton({ action }: UploadSkuFilesButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleUpload() {
    const input = inputRef.current;
    if (!input?.files?.length) {
      toast.error("Select at least one Excel file");
      return;
    }

    const formData = new FormData();
    for (const file of input.files) {
      formData.append("files", file);
    }

    startTransition(async () => {
      const result = await action(formData);

      if (result.summaryText) {
        setSummaryText(result.summaryText);
      }

      if (result.success) {
        toast.success("SKU import completed");
        router.refresh();
        setOpen(false);
        if (input) input.value = "";
      } else {
        toast.error(result.error ?? "SKU import failed");
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSummaryText(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          Upload Excel files
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Upload SKU Excel files</AlertDialogTitle>
          <AlertDialogDescription>
            Upload one or more product BOM spreadsheets (.xlsx). Each file
            creates or updates a product, upserts parts, and uploads BOM images
            to imgbb when configured.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="sku-files-upload">Excel files</Label>
          <Input
            ref={inputRef}
            id="sku-files-upload"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            disabled={pending}
          />
        </div>
        {summaryText ? (
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
            {summaryText}
          </pre>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={handleUpload} disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type UploadProductBomButtonProps = {
  productId: number;
  modelCode: string;
  action: (formData: FormData) => Promise<ActionResult>;
};

export function UploadProductBomButton({
  productId,
  modelCode,
  action,
}: UploadProductBomButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleUpload() {
    const input = inputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      toast.error("Select an Excel file");
      return;
    }

    const formData = new FormData();
    formData.set("productId", String(productId));
    formData.set("modelCode", modelCode);
    formData.set("file", file);

    startTransition(async () => {
      const result = await action(formData);

      if (result.success) {
        toast.success(`BOM uploaded for ${modelCode}`);
        router.refresh();
        setOpen(false);
        if (input) input.value = "";
      } else {
        toast.error(result.error ?? "BOM upload failed");
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          Upload BOM
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Upload BOM Excel file</AlertDialogTitle>
          <AlertDialogDescription>
            Upload the SKU spreadsheet for model code {modelCode}. The model
            code in the file must match this product. Existing BOM lines will be
            replaced.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`product-bom-upload-${productId}`}>Excel file</Label>
          <Input
            ref={inputRef}
            id={`product-bom-upload-${productId}`}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={pending}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={handleUpload} disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
