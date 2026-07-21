import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNAP — The small molecule binding instrument",
  description:
    "Hold a real molecule, explore a real protein pocket, and watch a transparent local interaction score respond to every move.",
  openGraph: {
    title: "SNAP — The small molecule binding instrument",
    description:
      "Fit a real ligand into a real protein pocket while an exact local AutoGrid score responds to every move.",
    type: "website",
    images: [
      {
        url: "/snap-social.png",
        width: 1672,
        height: 941,
        alt: "Illustrative molecular recognition scene for SNAP",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SNAP — The small molecule binding instrument",
    description:
      "A browser-native molecular recognition instrument with exact local AutoGrid scoring.",
    images: ["/snap-social.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#090b0d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
