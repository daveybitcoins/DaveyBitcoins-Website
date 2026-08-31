import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import "./btc-dashboard.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://daveybitcoins.com"),
  title: "DaveyBitcoins | Market Risk & Investing Tools",
  description:
    "Bitcoin and SPY risk metrics, a weekly EMA scanner, and a dividend portfolio tracker for long-term investors.",
  openGraph: {
    title: "DaveyBitcoins",
    description:
      "Market risk metrics and practical investing tools for long-term builders.",
    url: "/",
    siteName: "DaveyBitcoins",
    images: [
      {
        url: "/social-preview.png",
        width: 1200,
        height: 1200,
        alt: "A glowing Bitcoin clock in a futuristic golden landscape",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DaveyBitcoins",
    description:
      "Market risk metrics and practical investing tools for long-term builders.",
    images: ["/social-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('davey-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')}catch(e){}",
          }}
        />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
