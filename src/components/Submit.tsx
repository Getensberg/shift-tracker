"use client";

import { useFormStatus } from "react-dom";

export function Submit({
  children,
  className = "btn primary",
  pendingText,
  formAction,
  formNoValidate,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} formAction={formAction} formNoValidate={formNoValidate}>
      {pending ? pendingText ?? "…" : children}
    </button>
  );
}
