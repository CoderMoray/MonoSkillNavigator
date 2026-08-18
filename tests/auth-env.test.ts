import { describe, expect, test } from "vitest";
import {
  getRegistrationUnverifiedRetentionDays,
  isRegistrationEmailVerificationRequired,
} from "@skill-platform/storage";

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

describe("getRegistrationUnverifiedRetentionDays", () => {
  test("defaults to 3 days when unset", () => {
    expect(getRegistrationUnverifiedRetentionDays({})).toBe(3);
  });

  test("accepts explicit day values", () => {
    expect(getRegistrationUnverifiedRetentionDays({ REGISTRATION_UNVERIFIED_RETENTION_DAYS: "7" })).toBe(7);
    expect(getRegistrationUnverifiedRetentionDays({ REGISTRATION_UNVERIFIED_RETENTION_DAYS: "0" })).toBe(0);
  });
});
