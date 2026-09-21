import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: { default: "Agenda Pro", template: "%s | Agenda Pro" },
  description: "Agendamento online simples para pequenos profissionais.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><ToastProvider>{children}</ToastProvider></body></html>;
}
