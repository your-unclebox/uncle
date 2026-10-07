import type { ReactNode } from "react";

// UI-UX FormField: label + input + helper/error, konsisten di semua form.
export function FormField({
  id,
  label,
  required,
  error,
  helper,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | undefined;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          ⓘ {error}
        </p>
      ) : helper ? (
        <p className="text-sm text-subtle">{helper}</p>
      ) : null}
    </div>
  );
}
