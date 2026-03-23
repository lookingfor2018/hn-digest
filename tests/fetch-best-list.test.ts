import { describe, expect, it } from "vitest";

import { parseBestStoryIds } from "../src/fetch/hn.js";

describe("parseBestStoryIds", () => {
  it("parses unique ids with original order and limit", () => {
    const html = `
      <a href="item?id=101">A</a>
      <a href="item?id=102">B</a>
      <a href="item?id=101">A-dup</a>
      <a href="item?id=103">C</a>
    `;

    expect(parseBestStoryIds(html, 2)).toEqual([101, 102]);
    expect(parseBestStoryIds(html, 10)).toEqual([101, 102, 103]);
  });
});
