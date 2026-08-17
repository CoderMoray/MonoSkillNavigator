import { describe, expect, test } from "vitest";
import { isRegistrationEmailVerificationRequired } from "@skill-platform/storage";

describe("isRegistrationEmailVerificationRequired", () => {
  test("defaults to true when unset", () => {
    expect(isRegistrationEmailVerificationRequired({})).toBe(true);
  });

  test("returns false for explicit false values", () => {
    expect(isRegistrationEmailVerificationRequired({ REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "false" })).toBe(false);
    expect(isRegistrationEmailVerificationRequired({ REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "0" })).toBe(false);
    expect(isRegistrationEmailVerificationRequired({ REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "no" })).toBe(false);
  });

  test("returns true for explicit true values", () => {
    expect(isRegistrationEmailVerificationRequired({ REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "true" })).toBe(true);
    expect(isRegistrationEmailVerificationRequired({ REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "1" })).toBe(true);
    expect(isRegistrationEmailVerificationRequired({ REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "yes" })).toBe(true);
  });
});
