"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-4xl font-semibold sm:text-6xl"
      >
        Never wonder what to gift again.
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="max-w-xl text-lg opacity-80"
      >
        Tell us about them — we build the perfect gift bundle, with links to buy
        every item.
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="flex flex-col items-center gap-3"
      >
        <Link
          href="/quiz"
          className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85"
        >
          Start the quiz
        </Link>
        <Link href="/trending" className="text-sm underline opacity-70 hover:opacity-100">
          Or browse trending bundles
        </Link>
      </motion.div>
    </main>
  );
}
