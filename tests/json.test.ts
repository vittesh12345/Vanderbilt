// Defensive JSON helpers for *_Json columns.

import { describe, expect, it } from "vitest";
import { parseJson, toJson } from "@/lib/json";

describe("parseJson", () => {
  const fallback = { tier1: [], tier2: [], tier3: [] };

  it("returns the fallback on garbage input", () => {
    expect(parseJson("not json at all", fallback)).toBe(fallback);
    expect(parseJson("{broken", fallback)).toBe(fallback);
  });

  it("returns the fallback on null and undefined", () => {
    expect(parseJson(null, fallback)).toBe(fallback);
    expect(parseJson(undefined, fallback)).toBe(fallback);
    expect(parseJson("", fallback)).toBe(fallback);
  });

  it("returns the fallback when the stored value is JSON null", () => {
    expect(parseJson("null", fallback)).toBe(fallback);
  });

  it("passes through valid JSON", () => {
    expect(parseJson('{"a":1,"b":[2,3]}', {})).toEqual({ a: 1, b: [2, 3] });
    expect(parseJson("[]", ["x"])).toEqual([]);
    expect(parseJson("0", 42)).toBe(0); // falsy but valid parses win
  });
});

describe("toJson", () => {
  it("round-trips through parseJson", () => {
    const value = { weights: [{ category: "Exams", weight: 40 }], note: "ok" };
    expect(parseJson(toJson(value), null)).toEqual(value);
  });

  it("serializes undefined as null instead of producing invalid JSON", () => {
    expect(toJson(undefined)).toBe("null");
    expect(toJson(null)).toBe("null");
  });
});
