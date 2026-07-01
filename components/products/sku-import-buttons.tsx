"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import { toast } from "@/components/ui/sonner";
import {
  importProductBomFromBlobAction,
  importSkuFilesFromBlobAction,
  type SkuBlobUploadInput,
  uploadProductBomAction,
  uploadSkuFilesAction,
} from "@/lib/actions/sku-import";
import type { ActionResult } from "@/lib/actions/types";
import { uploadSkuExcelFileToBlob } from "@/lib/client/upload-sku-excel-blob";
import {
  type FileImportResult,
  formatImportSummary,
  type ImportSummary,
  summarizeImportResults,
} from "@/lib/sku-import-summary";
import {
  isBodySizeLimitError,
  SKU_UPLOAD_MAX_FILE_SIZE_LABEL,
  skuUploadBodySizeLimitMessage,
  validateSkuUploadFileSize,
} from "@/lib/sku-upload-limits";
import type { SkuExcelBlobUploadMode } from "@/lib/storage/sku-excel-blob";

type UploadSkuFilesButtonProps = {
  blobUploadMode: SkuExcelBlobUploadMode;
};

export function UploadSkuFilesButton({
  blobUploadMode,
}: UploadSkuFilesButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function validateSelectedFiles(files: File[]): string | null {
    for (const file of files) {
      const fileSizeError = validateSkuUploadFileSize(file);
      if (fileSizeError) {
        return fileSizeError;
      }
    }

    return null;
  }

  function handleFileChange() {
    const input = inputRef.current;
    if (!input?.files?.length) {
      setSizeError(null);
      return;
    }

    setSizeError(validateSelectedFiles(Array.from(input.files)));
  }

  function handleUpload() {
    const input = inputRef.current;
    if (!input?.files?.length) {
      toast.error("Select at least one Excel file");
      return;
    }

    const files = Array.from(input.files);
    const selectionError = validateSelectedFiles(files);
    if (selectionError) {
      setSizeError(selectionError);
      toast.error(selectionError);
      return;
    }

    setSizeError(null);

    startTransition(async () => {
      try {
        if (blobUploadMode !== "direct") {
          const blobUploads: SkuBlobUploadInput[] = [];

          for (let index = 0; index < files.length; index++) {
            const file = files[index];
            setUploadProgress(
              `Uploading ${index + 1} of ${files.length} to storage…`,
            );
            blobUploads.push(
              await uploadSkuExcelFileToBlob(file, blobUploadMode),
            );
          }

          setUploadProgress("Importing uploaded files…");
          const result = await importSkuFilesFromBlobAction(blobUploads);
          handleImportResult(
            result,
            input,
            files.map((file) => file.name),
          );
          return;
        }

        const fileResults: FileImportResult[] = [];

        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          setUploadProgress(`Uploading ${index + 1} of ${files.length}…`);

          const formData = new FormData();
          formData.append("files", file);

          try {
            const result = await uploadSkuFilesAction(formData);

            if (result.summary?.fileResults) {
              fileResults.push(...result.summary.fileResults);
            } else if (!result.success) {
              fileResults.push(buildFailedFileResult(file.name, result.error));
            }
          } catch (error) {
            fileResults.push(
              buildFailedFileResult(file.name, getUploadErrorMessage(error)),
            );
          }
        }

        setUploadProgress(null);

        const summary = summarizeImportResults(fileResults);
        setSummaryText(formatImportSummary(summary));
        finishImport(summary.filesFailed === 0, input);
      } catch (error) {
        setUploadProgress(null);
        toast.error(getUploadErrorMessage(error));
      }
    });
  }

  function handleImportResult(
    result: ActionResult & { summary?: ImportSummary; summaryText?: string },
    input: HTMLInputElement | null,
    fileNames: string[],
  ) {
    setUploadProgress(null);

    if (result.summaryText) {
      setSummaryText(result.summaryText);
    } else if (!result.success) {
      setSummaryText(
        formatImportSummary(
          summarizeImportResults(
            fileNames.map((fileName) =>
              buildFailedFileResult(fileName, result.error),
            ),
          ),
        ),
      );
    }

    const filesFailed = result.summary?.filesFailed ?? (result.success ? 0 : 1);
    finishImport(filesFailed === 0, input);

    if (filesFailed > 0) {
      toast.error(`${filesFailed} file(s) failed to import`);
    }
  }

  function finishImport(success: boolean, input: HTMLInputElement | null) {
    if (success) {
      toast.success("Excel import completed");
      router.refresh();
      setOpen(false);
      if (input) input.value = "";
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSummaryText(null);
      setUploadProgress(null);
      setSizeError(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          Upload Excel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Upload product Excel files</AlertDialogTitle>
          <AlertDialogDescription>
            Upload one or more product BOM spreadsheets (.xlsx). Each file must
            use a unique model code that is not already in the catalog.
            Duplicate parts within a file are rejected. Files are stored
            temporarily during import, then removed. Maximum file size:{" "}
            {SKU_UPLOAD_MAX_FILE_SIZE_LABEL} per file.
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
            onChange={handleFileChange}
            className="file:bg-primary p-0 file:h-8 file:px-3 file:mr-3"
          />
          {sizeError ? (
            <p className="text-destructive text-sm">{sizeError}</p>
          ) : null}
        </div>
        {summaryText ? (
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
            {summaryText}
          </pre>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleUpload}
            disabled={pending || Boolean(sizeError)}
          >
            {pending ? (uploadProgress ?? "Uploading…") : "Upload"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type UploadProductBomButtonProps = {
  productId: number;
  modelCode: string;
  blobUploadMode: SkuExcelBlobUploadMode;
};

export function UploadProductBomButton({
  productId,
  modelCode,
  blobUploadMode,
}: UploadProductBomButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleFileChange() {
    const input = inputRef.current;
    const file = input?.files?.[0];
    setSizeError(file ? validateSkuUploadFileSize(file) : null);
  }

  function handleUpload() {
    const input = inputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      toast.error("Select an Excel file");
      return;
    }

    const fileSizeError = validateSkuUploadFileSize(file);
    if (fileSizeError) {
      setSizeError(fileSizeError);
      toast.error(fileSizeError);
      return;
    }

    setSizeError(null);

    startTransition(async () => {
      try {
        if (blobUploadMode !== "direct") {
          const blobUpload = await uploadSkuExcelFileToBlob(
            file,
            blobUploadMode,
          );
          const result = await importProductBomFromBlobAction(
            productId,
            modelCode,
            blobUpload,
          );

          if (result.success) {
            toast.success(`BOM uploaded for ${modelCode}`);
            router.refresh();
            setOpen(false);
            if (input) input.value = "";
          } else {
            toast.error(result.error ?? "BOM upload failed");
          }
          return;
        }

        const formData = new FormData();
        formData.set("productId", String(productId));
        formData.set("modelCode", modelCode);
        formData.set("file", file);

        const result = await uploadProductBomAction(formData);

        if (result.success) {
          toast.success(`BOM uploaded for ${modelCode}`);
          router.refresh();
          setOpen(false);
          if (input) input.value = "";
        } else {
          toast.error(result.error ?? "BOM upload failed");
        }
      } catch (error) {
        toast.error(getUploadErrorMessage(error));
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSizeError(null);
      if (inputRef.current) inputRef.current.value = "";
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
            Upload the product spreadsheet for model code {modelCode}. The model
            code in the file must match this product. Duplicate parts within the
            file are rejected. Existing BOM lines will be replaced. The file is
            stored temporarily during import, then removed. Maximum file size:{" "}
            {SKU_UPLOAD_MAX_FILE_SIZE_LABEL}.
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
            onChange={handleFileChange}
          />
          {sizeError ? (
            <p className="text-destructive text-sm">{sizeError}</p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleUpload}
            disabled={pending || Boolean(sizeError)}
          >
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function buildFailedFileResult(
  fileName: string,
  error?: string,
): FileImportResult {
  return {
    fileName,
    modelCode: "",
    displayName: "",
    productCreated: false,
    productUpdated: false,
    partsCreated: 0,
    partsUpdated: 0,
    bomLinesImported: 0,
    imagesExtracted: 0,
    imagesUploaded: 0,
    imagesFailed: 0,
    imagesSkipped: false,
    skippedRows: [],
    error: error ?? "Excel import failed",
  };
}

function getUploadErrorMessage(error: unknown): string {
  if (isBodySizeLimitError(error)) {
    return skuUploadBodySizeLimitMessage();
  }

  return error instanceof Error ? error.message : "Upload failed";
}
