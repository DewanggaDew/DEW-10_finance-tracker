import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins rows with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("escapes commas, quotes and newlines", () => {
    expect(toCsv(["note"], [['kopi "enak", murah'], ["two\nlines"]])).toBe(
      'note\r\n"kopi ""enak"", murah"\r\n"two\nlines"',
    );
  });
});
