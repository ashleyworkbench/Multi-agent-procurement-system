import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "ProcureFlow — Intelligent Procurement",
  description: "Multi-agent procurement management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              style: { fontFamily: "Inter, system-ui, sans-serif" },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
