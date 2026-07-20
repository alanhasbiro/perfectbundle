import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: vi.fn(),
}));

vi.mock("@/lib/analytics-server", () => ({
  captureServerEvent: vi.fn(),
}));

import { POST } from "./route";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { captureServerEvent } from "@/lib/analytics-server";

const verifyWebhookMock = vi.mocked(verifyWebhook);
const captureServerEventMock = vi.mocked(captureServerEvent);

// verifyWebhook is mocked above, so these only need to satisfy the parts of
// its return type the route handler actually reads (type, data.id,
// data.external_accounts) — cast through unknown for the rest of the shape.
type MockWebhookEvent = Awaited<ReturnType<typeof verifyWebhook>>;
function mockEvent(event: {
  type: string;
  data: { id: string; external_accounts: Array<{ provider: string }> };
}): MockWebhookEvent {
  return event as unknown as MockWebhookEvent;
}

function req(): NextRequest {
  return new NextRequest("https://example.com/api/webhooks/clerk", { method: "POST" });
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    verifyWebhookMock.mockReset();
    captureServerEventMock.mockReset().mockResolvedValue(undefined);
  });

  it("captures a signup event on user.created", async () => {
    verifyWebhookMock.mockResolvedValue(
      mockEvent({
        type: "user.created",
        data: {
          id: "user_123",
          external_accounts: [{ provider: "oauth_google" }],
        },
      })
    );

    const response = await POST(req());

    expect(response.status).toBe(200);
    expect(captureServerEventMock).toHaveBeenCalledWith("signup", "user_123", { method: "google" });
  });

  it("does nothing but still acks for other event types", async () => {
    verifyWebhookMock.mockResolvedValue(
      mockEvent({
        type: "user.updated",
        data: { id: "user_123", external_accounts: [] },
      })
    );

    const response = await POST(req());

    expect(response.status).toBe(200);
    expect(captureServerEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 and skips capture when signature verification fails", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("invalid signature"));

    const response = await POST(req());

    expect(response.status).toBe(400);
    expect(captureServerEventMock).not.toHaveBeenCalled();
  });
});
