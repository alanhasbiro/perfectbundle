// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreateSessionId } from "./session-id";

describe("getOrCreateSessionId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a non-empty string", () => {
    const id = getOrCreateSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("persists and returns the same id on repeated calls", () => {
    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(second).toBe(first);
  });

  it("stores the id under the pb.sessionId localStorage key", () => {
    const id = getOrCreateSessionId();
    expect(localStorage.getItem("pb.sessionId")).toBe(id);
  });

  it("reuses an id already present in localStorage", () => {
    localStorage.setItem("pb.sessionId", "existing-id-123");
    expect(getOrCreateSessionId()).toBe("existing-id-123");
  });

  it("falls back gracefully when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => getOrCreateSessionId()).not.toThrow();
    spy.mockRestore();
  });
});
