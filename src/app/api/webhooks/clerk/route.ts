import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { captureServerEvent } from "@/lib/analytics-server";
import { signupMethodFromExternalAccounts } from "@/lib/webhooks/clerk-signup";

export async function POST(request: NextRequest): Promise<Response> {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (err) {
    console.error("Clerk webhook signature verification failed", err);
    return new Response("Webhook verification failed", { status: 400 });
  }

  if (event.type === "user.created") {
    const method = signupMethodFromExternalAccounts(event.data.external_accounts);
    await captureServerEvent("signup", event.data.id, { method });
  }

  return new Response("ok", { status: 200 });
}
