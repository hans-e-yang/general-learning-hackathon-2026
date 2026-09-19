import { describe, expect, it } from "vitest";
import { hasMathSyntax, renderMathText } from "./mathText";

describe("hasMathSyntax", () => {
  it("detects inline $...$", () => {
    expect(hasMathSyntax("area is $\\frac{1}{2}$")).toBe(true);
  });

  it("returns false for plain prose", () => {
    expect(hasMathSyntax("just words")).toBe(false);
  });
});

describe("renderMathText", () => {
  it("returns plain for non-math", () => {
    expect(renderMathText("hello")).toEqual({ kind: "plain", source: "hello" });
  });

  it("renders valid KaTeX to html", () => {
    const result = renderMathText("\\frac{1}{2}");
    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).toContain("katex");
    }
  });

  it("renders $...$ wrappers", () => {
    const result = renderMathText("$\\frac{1}{2}$");
    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).toContain("katex");
    }
  });

  it("renders mixed prose with inline math", () => {
    const result = renderMathText("area is $\\frac{1}{2}$");
    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).toContain("area is");
      expect(result.html).toContain("katex");
    }
  });

  it("degrades malformed LaTeX to plain with flag", () => {
    const result = renderMathText("\\frac{1{2}");
    expect(result).toEqual({
      kind: "plain",
      source: "\\frac{1{2}",
      degraded: true,
    });
  });
});
