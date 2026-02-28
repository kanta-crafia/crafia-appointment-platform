import { describe, expect, it } from "vitest";
import { verifyEmailConnection } from "./email";

describe("email", () => {
  it("should verify SMTP connection with Gmail credentials", async () => {
    const connected = await verifyEmailConnection();
    expect(connected).toBe(true);
  }, 15000);
});
