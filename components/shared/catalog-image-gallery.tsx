"use client";

import Image from "next/image";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

type CatalogImageGalleryProps = {
  imageUrls: string[];
  title: string;
};

export function CatalogImageGallery({
  imageUrls,
  title,
}: CatalogImageGalleryProps) {
  const urls = imageUrls.filter(Boolean);

  if (urls.length === 0) {
    return <p className="text-sm text-muted-foreground">No images attached.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {urls.map((url, index) => (
        <Drawer key={url}>
          <DrawerTrigger asChild>
            <button
              type="button"
              className="group overflow-hidden rounded-lg border bg-muted text-left"
            >
              <div className="relative aspect-square w-full">
                <Image
                  src={url}
                  alt={`${title} image ${index + 1}`}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 200px"
                  className="object-cover transition-opacity group-hover:opacity-90"
                />
              </div>
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-w-2xl">
            <DrawerHeader>
              <DrawerTitle>
                {title} — image {index + 1}
              </DrawerTitle>
            </DrawerHeader>
            <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted">
              <Image
                src={url}
                alt={`${title} image ${index + 1}`}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-contain"
              />
            </div>
          </DrawerContent>
        </Drawer>
      ))}
    </div>
  );
}
