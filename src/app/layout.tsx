import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { MotionConfigProvider } from "@/components/motion-config-provider";
import { PostHogProvider } from "@/components/posthog-provider";

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
        <PostHogProvider>
          <MotionConfigProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </MotionConfigProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
