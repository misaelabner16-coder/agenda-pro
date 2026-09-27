import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: { default: "Agenda Pro", template: "%s | Agenda Pro" },
  description: "Agendamento online simples para pequenos profissionais.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // CSP nonces must be rendered for this request, never cached into static HTML.
  await connection();
  return <html lang="pt-BR"><body><ToastProvider>{children}</ToastProvider></body></html>;
}
