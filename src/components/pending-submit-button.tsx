"use client";

import { useFormStatus } from "react-dom";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  idleLabel: string;
  pendingLabel: string;
};

export function PendingSubmitButton({ idleLabel, pendingLabel, disabled, ...props }: Props) {
  const { pending } = useFormStatus();
  return <button {...props} type="submit" disabled={disabled || pending}>{pending ? pendingLabel : idleLabel}</button>;
}
