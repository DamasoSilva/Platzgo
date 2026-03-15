import type { Metadata } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
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
        className={`${outfit.variable} ${spaceGrotesk.variable} min-h-screen bg-[#050608] text-zinc-100 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
