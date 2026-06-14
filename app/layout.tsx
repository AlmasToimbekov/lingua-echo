import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LinguaEcho — Английский для семьи и детей",
  description: "Простое приложение для практики английского с естественной озвучкой. Шаблоны + генерация новых с помощью вашего ключа Google Gemini. Голоса через ElevenLabs или браузер.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 overflow-x-hidden touch-pan-y">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
