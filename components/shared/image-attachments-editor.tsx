"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { CATALOG_IMAGE_MAX_COUNT } from "@/lib/catalog-image-limits";
import type {
  CatalogImageBlobUploadMode,
  CatalogImageEntityType,
} from "@/lib/catalog-image-shared";
import { uploadCatalogImageFile } from "@/lib/client/upload-catalog-images";

type ImageAttachmentsEditorProps = {
  entityType: CatalogImageEntityType;
  uploadMode: CatalogImageBlobUploadMode;
  initialUrls?: string[];
  disabled?: boolean;
};

export function ImageAttachmentsEditor({
  entityType,
  uploadMode,
  initialUrls = [],
  disabled = false,
}: ImageAttachmentsEditorProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploadingCount, setUploadingCount] = useState(0);

  const isUploading = uploadingCount > 0;
  const atLimit = urls.length >= CATALOG_IMAGE_MAX_COUNT;

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length || disabled || atLimit) return;

    const remainingSlots = CATALOG_IMAGE_MAX_COUNT - urls.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      toast.error(`You can attach at most ${CATALOG_IMAGE_MAX_COUNT} images`);
    }

    setUploadingCount((count) => count + filesToUpload.length);

    const uploadedUrls: string[] = [];
    for (const file of filesToUpload) {
      try {
        const imageUrl = await uploadCatalogImageFile(
          file,
          entityType,
          uploadMode,
        );
        uploadedUrls.push(imageUrl);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to upload image",
        );
      } finally {
        setUploadingCount((count) => Math.max(0, count - 1));
      }
    }

    if (uploadedUrls.length > 0) {
      setUrls((current) => [...current, ...uploadedUrls]);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeUrl(urlToRemove: string) {
    setUrls((current) => current.filter((url) => url !== urlToRemove));
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>Images</Label>
        <span className="text-xs text-muted-foreground">Optional</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Attach up to {CATALOG_IMAGE_MAX_COUNT} images (JPEG, PNG, WebP, or GIF).
      </p>

      {urls.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {urls.map((url) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <Image
                src={url}
                alt="Attached image"
                fill
                unoptimized
                sizes="96px"
                className="object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-1 right-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => removeUrl(url)}
                disabled={disabled || isUploading}
                aria-label="Remove image"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {urls.map((url) => (
        <input key={url} type="hidden" name="imageUrls" value={url} />
      ))}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="sr-only"
          disabled={disabled || isUploading || atLimit}
          onChange={(event) => handleFilesSelected(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isUploading || atLimit}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          {isUploading ? "Uploading…" : "Add images"}
        </Button>
        {atLimit ? (
          <span className="text-xs text-muted-foreground">
            Maximum images attached
          </span>
        ) : null}
      </div>
    </div>
  );
}
