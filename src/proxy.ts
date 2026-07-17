import { clerkMiddleware } from "@clerk/nextjs/server";

// PerfectBundle is guest-first (see docs/checkpoint.md Technical Decisions
// Log): quiz, results, share, and trending stay public. Only save/profile
// routes (built in M4) will call auth.protect() individually.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
