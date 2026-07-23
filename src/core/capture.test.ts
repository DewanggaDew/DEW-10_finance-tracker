import { describe, expect, it } from "vitest";
import { parseCapture } from "./capture";

describe("parseCapture", () => {
  it("parses k/rb/jt shorthand", () => {
    expect(parseCapture("50k kopi")).toEqual({ amountMajor: 50_000, note: "kopi" });
    expect(parseCapture("50rb kopi")).toEqual({ amountMajor: 50_000, note: "kopi" });
    expect(parseCapture("1.5jt sepatu")).toEqual({
      amountMajor: 1_500_000,
      note: "sepatu",
    });
    expect(parseCapture("1,5jt")).toEqual({ amountMajor: 1_500_000 });
  });

  it("amount can sit anywhere; note keeps the rest in order", () => {
    expect(parseCapture("kopi 50k indomaret")).toEqual({
      amountMajor: 50_000,
      note: "kopi indomaret",
    });
  });

  it("treats suffix-less 3-decimal groups as thousands notation", () => {
    expect(parseCapture("12.500")).toEqual({ amountMajor: 12_500 });
    expect(parseCapture("12500")).toEqual({ amountMajor: 12_500 });
  });

  it("returns null when no amount is present", () => {
    expect(parseCapture("kopi enak")).toBeNull();
    expect(parseCapture("")).toBeNull();
  });
});
