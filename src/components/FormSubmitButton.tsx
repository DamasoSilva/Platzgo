"use client";

import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = {
  label: string;
  pendingLabel?: string;
  className?: string;
};

export function FormSubmitButton(props: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const label = pending ? props.pendingLabel ?? "Salvando..." : props.label;

  return (
    <button type="submit" className={props.className} disabled={pending} aria-busy={pending}>
      {label}
    </button>
  );
}
