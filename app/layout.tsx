import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { hospital, SITE_URL } from "@/app/lib/data";

import { TriageWidget } from "@/app/components/TriageWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Protone Care Hospital | Sector 11 Gurugram",
    template: "%s | Protone Care Hospital",
  },
  description:
    "Premium multispeciality hospital in Sector 11, Gurugram with 24x7 emergency, OPD/IPD, ICU, NICU, diagnostics, surgery support, and department-based appointment requests.",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Protone Care Hospital",
    description: "Compassion | Care | Cure in Sector 11, Gurugram.",
    url: SITE_URL,
    siteName: hospital.name,
    images: [{ url: hospital.wideImage, width: 1200, height: 630, alt: "Protone Care Hospital exterior" }],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Protone Care Hospital",
    description: "24x7 emergency and department-based appointment requests in Gurugram.",
    images: [hospital.wideImage],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${plusJakarta.variable} ${inter.variable} antialiased`}
      >
        {children}
        <TriageWidget />
      </body>
    </html>
  );
}
