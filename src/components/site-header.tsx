import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href="/" className="text-sm font-semibold">
        PerfectBundle
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <Show when="signed-out">
          <SignInButton>
            <button className="opacity-70 hover:opacity-100">Sign in</button>
          </SignInButton>
          <SignUpButton>
            <button className="btn-primary px-4 py-1.5 text-xs">
              Sign up
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link href="/my-bundles" className="opacity-70 transition hover:text-accent-solid hover:opacity-100">
            My bundles
          </Link>
          <Link href="/profiles" className="opacity-70 transition hover:text-accent-solid hover:opacity-100">
            Profiles
          </Link>
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
