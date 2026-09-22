"use client";

import { useActionState, useEffect } from "react";
import { useToast } from "@/components/toast-provider";

export type ActionState = { error?: string; success?: string };
const initialState: ActionState = {};

type Props = Omit<React.FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
};

export function ActionForm({ action, children, ...props }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const { showToast } = useToast();
  useEffect(() => {
    if (state.success) showToast(state.success);
    if (state.error) showToast(state.error, "error");
  }, [state, showToast]);
  return <form {...props} action={formAction}><fieldset disabled={pending} className="contents">{children}</fieldset></form>;
}
