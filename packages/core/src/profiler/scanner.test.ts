/**
 * System Scanner Tests
 */

import { describe, it, expect } from "vitest";
import { runSystemScan, stripSensitiveData } from "./scanner.js";

describe("runSystemScan", () => {
  it("returns a ScanContext with dimensions map", async () => {
    const { context, sources } = await runSystemScan();

    expect(context).toBeDefined();
    expect(context.dimensions).toBeInstanceOf(Map);
    expect(sources).toBeInstanceOf(Array);
  });

  it("detects timezone", async () => {
    const { context } = await runSystemScan();

    const tz = context.dimensions.get("identity.timezone");
    expect(tz).toBeDefined();
    expect(tz!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(tz!.source).toBe("system");
  });

  it("detects language from locale", async () => {
    const { context } = await runSystemScan();

    const lang = context.dimensions.get("identity.language");
    // Should be detected from LANG env or Intl
    if (lang) {
      expect(lang.value).toMatch(/^[a-z]{2}$/);
      expect(lang.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("detects tech stack from project directory", async () => {
    // Run scan on meport's own directory (has package.json + tsconfig.json)
    const { context } = await runSystemScan(process.cwd());

    const tech = context.dimensions.get("expertise.tech_stack");
    if (tech) {
      expect(tech.value).toContain("TypeScript");
      expect(tech.confidence).toBeGreaterThanOrEqual(0.8);
      expect(tech.source).toBe("project-files");
    }
  });

  it("all dimension values have required fields", async () => {
    const { context } = await runSystemScan(process.cwd());

    for (const [dim, val] of context.dimensions) {
      expect(val).toHaveProperty("value");
      expect(val).toHaveProperty("confidence");
      expect(val).toHaveProperty("source");
      expect(val.confidence).toBeGreaterThanOrEqual(0);
      expect(val.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("sources array is populated", async () => {
    const { context, sources } = await runSystemScan();

    // Should at least detect timezone
    expect(sources.length).toBeGreaterThan(0);
  });
});

describe("stripSensitiveData — redacts", () => {
  it("redacts passwords", () => {
    const result = stripSensitiveData("password: mysecret123");
    expect(result).toBe("[REDACTED]");
  });

  it("redacts API keys", () => {
    const result = stripSensitiveData("api_key=sk-abc123def");
    expect(result).toBe("[REDACTED]");
  });

  it("redacts PESEL with context", () => {
    const result = stripSensitiveData("PESEL: 90010112345");
    expect(result).toBe("[PESEL-REDACTED]");
  });

  it("redacts NIP with context", () => {
    const result = stripSensitiveData("NIP: 1234567890");
    expect(result).toBe("[NIP-REDACTED]");
  });

  it("redacts IBAN", () => {
    const result = stripSensitiveData("PL61109010140000071219812874");
    expect(result).toBe("[IBAN-REDACTED]");
  });

  it("redacts private keys", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
    const result = stripSensitiveData(input);
    expect(result).toBe("[KEY-REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    const result = stripSensitiveData("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc");
    expect(result).toBe("Bearer [REDACTED]");
  });

  it("redacts AWS access keys", () => {
    const result = stripSensitiveData("AKIAIOSFODNN7EXAMPLE");
    expect(result).toBe("[AWS-KEY-REDACTED]");
  });
});

describe("stripSensitiveData — does NOT redact", () => {
  it("does not redact phone numbers without PESEL context", () => {
    const input = "tel: 48512345678";
    const result = stripSensitiveData(input);
    expect(result).toBe("tel: 48512345678");
  });

  it("does not redact 'token' as a standalone word", () => {
    const input = "JWT token rotation strategy";
    const result = stripSensitiveData(input);
    expect(result).toBe("JWT token rotation strategy");
  });

  it("does not redact normal text", () => {
    const input = "I work as a developer in Krakow";
    const result = stripSensitiveData(input);
    expect(result).toBe("I work as a developer in Krakow");
  });

  it("does not redact short numbers", () => {
    const input = "I have 3 years of experience";
    const result = stripSensitiveData(input);
    expect(result).toBe("I have 3 years of experience");
  });
});
