import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://snap-binding.sammsamy.chatgpt.site"),
  title: "SNAP — The small molecule binding instrument",
  description:
    "Move real ligands through two prepared protein pockets and watch a transparent local AutoGrid score respond to every move.",
  openGraph: {
    url: "https://snap-binding.sammsamy.chatgpt.site",
    title: "SNAP — The small molecule binding instrument",
    description:
      "Fit ligands into prepared streptavidin and c-MET pockets while the same local AutoGrid engine responds to every move.",
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
      "A browser-native molecular recognition instrument with two prepared targets and exact local AutoGrid scoring.",
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
