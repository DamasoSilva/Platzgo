import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GlobalBackButton } from "@/components/GlobalBackButton";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PlatzGo!",
  description: "SaaS de quadras: encontre e agende",
  icons: {
    icon: "/icon.png",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${inter.variable} min-h-screen bg-[#121212] text-zinc-100 antialiased`}
      >
        <GlobalBackButton />
        {children}
      </body>
    </html>
  );
}
