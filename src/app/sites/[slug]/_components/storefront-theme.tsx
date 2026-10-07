import type { CSSProperties, ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

type ThemeVars = CSSProperties & Record<`--${string}`, string>;

// Warna client → token CSS. Tanpa warna client: warna default Uncle.
export function StorefrontTheme({ event, children }: { event: PublicEvent; children: ReactNode }) {
  const style: ThemeVars = {};
  if (event.primaryColor) style["--color-primary"] = event.primaryColor;
  if (event.onPrimaryColor) style["--color-on-primary"] = event.onPrimaryColor;
  if (event.secondaryColor) style["--color-secondary"] = event.secondaryColor;
  return (
    <div className="storefront-theme flex min-h-full flex-1 flex-col" style={style}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
