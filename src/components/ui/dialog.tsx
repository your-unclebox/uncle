"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-ink/40" />
      <DialogPrimitive.Content className="fixed inset-x-4 bottom-4 z-50 rounded-xl bg-surface p-6 shadow-lg md:inset-auto md:top-1/2 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2">
        <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-2 text-subtle">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="mt-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
