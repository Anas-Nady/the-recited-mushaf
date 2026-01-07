import type { Metadata, Viewport } from "next";
import { Cairo, Geist_Mono } from "next/font/google"; // Imported Cairo
import "./globals.css";

// Setup Cairo for Arabic text
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic"], // Important: Specify arabic subset
  display: "swap",
});

// Keep Geist Mono for code blocks or technical numbers if needed
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "المصحف المرتل",
  description: "منصة لتلاوات القرآن الكريم بأصوات عذبة",
  keywords: ["قرآن", "تلاوة", "اسلام", "مصحف"],
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Moved dir="rtl" to html for better scrollbar rendering
    <html lang="ar" dir="rtl">
      <body
        className={`${cairo.variable} ${geistMono.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
