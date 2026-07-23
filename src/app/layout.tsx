import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Zodiak (Fontshare) — display serif for headings, paired with Jakarta Sans.
const zodiak = localFont({
  src: "../fonts/Zodiak-Bold.woff2",
  weight: "700",
  variable: "--font-zodiak",
});

export const metadata: Metadata = {
  title: "Kanto",
  description: "Personal portfolio & finance tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${zodiak.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
