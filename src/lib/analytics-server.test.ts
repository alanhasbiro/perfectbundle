import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureServerEvent } from "./analytics-server";

describe("captureServerEvent", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("does nothing when no PostHog key is configured", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const fetchMock = vi.fn();

    await captureServerEvent("signup", "user_123", { method: "email" }, fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the PostHog capture API with the project key, event, distinct_id, and properties", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await captureServerEvent("signup", "user_123", { method: "google" }, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe("phc_test_key");
    expect(body.event).toBe("signup");
    expect(body.distinct_id).toBe("user_123");
    expect(body.properties).toEqual({ method: "google" });
    expect(typeof body.timestamp).toBe("string");
  });

  it("falls back to the US PostHog host when none is configured", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await captureServerEvent("signup", "user_123", undefined, fetchMock);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
  });

  it("swallows fetch errors instead of throwing", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      captureServerEvent("signup", "user_123", undefined, fetchMock)
    ).resolves.toBeUndefined();
  });
});
