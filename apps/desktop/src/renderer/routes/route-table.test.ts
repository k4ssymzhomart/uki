import { describe, expect, it } from "vitest";
import { routeOf } from "./route-table.ts";

describe("routeOf", () => {
  it("serves the galleries only when they are built in", () => {
    expect(routeOf("#/gallery", true)).toBe("gallery");
    expect(routeOf("#/screens?frame=2.1&locale=ru", true)).toBe("screens");
    expect(routeOf("#/gallery", false)).toBe("student");
    expect(routeOf("#/screens", false)).toBe("student");
  });

  it("shows the student window for any other hash", () => {
    expect(routeOf("", true)).toBe("student");
    expect(routeOf("#/", true)).toBe("student");
    expect(routeOf("#/galleryx", true)).toBe("student");
  });
});
