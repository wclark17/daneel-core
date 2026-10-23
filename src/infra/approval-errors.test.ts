// Covers approval-not-found error detection.
import { describe, expect, it } from "vitest";
import {
  isApprovalAlreadyResolvedError,
  isApprovalNotFoundError,
  isTerminalApprovalResolveError,
} from "./approval-errors.js";

describe("isApprovalNotFoundError", () => {
  it("matches direct approval-not-found gateway codes", () => {
    const err = new Error("approval not found") as Error & { gatewayCode?: string };
    err.gatewayCode = "APPROVAL_NOT_FOUND";
    expect(isApprovalNotFoundError(err)).toBe(true);
  });

  it("matches structured invalid-request approval-not-found details", () => {
    const err = new Error("approval not found") as Error & {
      gatewayCode?: string;
      details?: { reason?: string };
    };
    err.gatewayCode = "INVALID_REQUEST";
    err.details = { reason: "APPROVAL_NOT_FOUND" };
    expect(isApprovalNotFoundError(err)).toBe(true);
  });

  it("matches legacy message-only not-found errors", () => {
    expect(isApprovalNotFoundError(new Error("unknown or expired approval id"))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isApprovalNotFoundError(new Error("network timeout"))).toBe(false);
    expect(isApprovalNotFoundError("unknown or expired approval id")).toBe(false);
  });
});

describe("isApprovalAlreadyResolvedError", () => {
  it("matches structured invalid-request already-resolved details", () => {
    const err = new Error("approval already resolved") as Error & {
      gatewayCode?: string;
      details?: { reason?: string };
    };
    err.gatewayCode = "INVALID_REQUEST";
    err.details = { reason: "APPROVAL_ALREADY_RESOLVED" };
    expect(isApprovalAlreadyResolvedError(err)).toBe(true);
    expect(isTerminalApprovalResolveError(err)).toBe(true);
  });

  it("matches message-only already-resolved errors from gateway middleware", () => {
    const err = new Error("GatewayClientRequestError in middleware: approval already resolved");
    expect(isApprovalAlreadyResolvedError(err)).toBe(true);
    expect(isApprovalNotFoundError(err)).toBe(false);
    expect(isTerminalApprovalResolveError(err)).toBe(true);
  });

  it("ignores unrelated and not-found errors", () => {
    expect(isApprovalAlreadyResolvedError(new Error("network timeout"))).toBe(false);
    expect(isApprovalAlreadyResolvedError(new Error("unknown or expired approval id"))).toBe(false);
    expect(isTerminalApprovalResolveError(new Error("network timeout"))).toBe(false);
  });
});
