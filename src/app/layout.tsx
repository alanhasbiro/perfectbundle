import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { MotionConfigProvider } from "@/components/motion-config-provider";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "PerfectBundle — gift bundles picked for the person";
const DESCRIPTION =
  "Answer a short quiz about them; get themed gift bundles with links to buy every item.";

export const metadata: Metadata = {
  metadataBase: new URL("https://perfectbundle.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "var(--accent-solid)",
              colorBackground: "var(--background)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--fg-muted)",
              colorInput: "var(--background)",
              colorInputForeground: "var(--foreground)",
              borderRadius: "0.75rem",
            },
            elements: {
              // UserButton popover action buttons ("Manage account", "Sign out")
              // don't inherit colorText/colorTextSecondary from the variables above,
              // so their text color is set explicitly here.
              userButtonPopoverActionButton: {
                color: "var(--foreground)",
              },
              // User email/identifier text in the popover header.
              userPreviewMainIdentifierText: {
                color: "var(--foreground)",
              },
              // Popover footer ("Secured by Clerk").
              userButtonPopoverFooter: {
                color: "var(--fg-muted)",
              },
            },
          }}
        >
          <MotionConfigProvider>
            <ConvexClientProvider>
              <SiteHeader />
              {children}
            </ConvexClientProvider>
          </MotionConfigProvider>
        </ClerkProvider>
      </body>
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9391534437442090"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
    </html>
  );
}