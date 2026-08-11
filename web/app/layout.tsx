import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = protocol + "://" + host;
  return {
    metadataBase: new URL(origin),
    title: "GrantGuard — Proof before payout",
    description:
      "Bind open-source grant milestones, verify public evidence through GenLayer consensus, and inspect every finalized verdict.",
    openGraph: {
      title: "GrantGuard — Proof before payout",
      description:
        "Source-bound adjudication for open-source grant milestones on GenLayer.",
      images: [{ url: origin + "/og.png", width: 1536, height: 1024 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "GrantGuard — Proof before payout",
      description:
        "Source-bound adjudication for open-source grant milestones on GenLayer.",
      images: [origin + "/og.png"],
    },
  };
}

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
