"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
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
import type {
  CustomerOrder,
  CustomerOrderLine,
  Product,
} from "@/lib/db/schema";

type ProductOption = Pick<Product, "id" | "displayName" | "modelCode">;

type OrderWithLines = CustomerOrder & {
  lines: Array<CustomerOrderLine & { product: Product }>;
};

type OrderLineDraft = {
  id: string;
  productId: string;
  quantity: string;
};

type OrderFormDialogProps = {
  order?: OrderWithLines;
  products: ProductOption[];
  action: (formData: FormData) => Promise<ActionResult>;
  triggerLabel?: string;
};

function createEmptyLine(): OrderLineDraft {
  return { id: crypto.randomUUID(), productId: "", quantity: "1" };
}

function linesFromOrder(order: OrderWithLines): OrderLineDraft[] {
  return order.lines.map((line) => ({
    id: crypto.randomUUID(),
    productId: String(line.productId),
    quantity: String(line.quantity),
  }));
}

export function OrderFormDialog({
  order,
  products,
  action,
  triggerLabel,
}: OrderFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(order);

  const [lines, setLines] = useState<OrderLineDraft[]>(
    order ? linesFromOrder(order) : [createEmptyLine()],
  );

  function resetForm() {
    setLines(order ? linesFromOrder(order) : [createEmptyLine()]);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function addLine() {
    setLines((current) => [...current, createEmptyLine()]);
  }

  function removeLine(index: number) {
    setLines((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );
  }

  function updateLine(index: number, patch: Partial<OrderLineDraft>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedLines = lines
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
      }))
      .filter(
        (line) =>
          Number.isFinite(line.productId) &&
          Number.isFinite(line.quantity) &&
          line.quantity > 0,
      );

    if (parsedLines.length === 0) {
      toast.error("Add at least one product line with a positive quantity");
      return;
    }

    const formData = new FormData();
    if (order) formData.set("id", String(order.id));
    formData.set("linesJson", JSON.stringify(parsedLines));

    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(isEdit ? "Order updated" : "Order created");
        setOpen(false);
        router.refresh();
        if (!isEdit && "id" in result && result.id) {
          router.push(`/orders/${result.id}`);
        }
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={isEdit ? "outline" : "default"}
          size={isEdit ? "sm" : "default"}
        >
          {triggerLabel ?? (isEdit ? "Edit" : "New order")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit customer order" : "Create customer order"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update product lines for this pending order."
              : "Add products and quantities to create a new customer order."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Order lines</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
              >
                <PlusIcon className="size-4" />
                Add line
              </Button>
            </div>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products available. Upload Excel files or add products first.
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={line.id} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1.5">
                      <Label
                        htmlFor={`order-line-product-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        Product
                      </Label>
                      <select
                        id={`order-line-product-${index}`}
                        value={line.productId}
                        onChange={(event) =>
                          updateLine(index, { productId: event.target.value })
                        }
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        required
                      >
                        <option value="">Select product…</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.displayName} ({product.modelCode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid w-24 gap-1.5">
                      <Label
                        htmlFor={`order-line-qty-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        Qty
                      </Label>
                      <Input
                        id={`order-line-qty-${index}`}
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(index, { quantity: event.target.value })
                        }
                        required
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => removeLine(index)}
                      aria-label="Remove line"
                    >
                      <MinusIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="px-0 pb-0">
            <Button type="submit" disabled={pending || products.length === 0}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
