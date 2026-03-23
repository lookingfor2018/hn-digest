import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBestStoryIds, parseBestStoryIds, parseMoreLink } from "../src/fetch/hn.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

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

  it("parses HN more link into an absolute next page url", () => {
    const html = `
      <a href="item?id=101">A</a>
      <a class="morelink" href="best?next=101&n=31">More</a>
    `;

    expect(parseMoreLink(html, "https://news.ycombinator.com/best?h=24")).toBe(
      "https://news.ycombinator.com/best?next=101&n=31"
    );
  });

  it("follows multiple HN best-list pages until the requested limit", async () => {
    const pageOne = `
      <a href="item?id=101">A</a>
      <a href="item?id=102">B</a>
      <a class="morelink" href="best?next=102&n=31">More</a>
    `;
    const pageTwo = `
      <a href="item?id=103">C</a>
      <a href="item?id=104">D</a>
      <a class="morelink" href="best?next=104&n=61">More</a>
    `;
    const pageThree = `
      <a href="item?id=105">E</a>
      <a href="item?id=106">F</a>
    `;

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body =
        url === "https://news.ycombinator.com/best?h=24"
          ? pageOne
          : url === "https://news.ycombinator.com/best?next=102&n=31"
            ? pageTwo
            : pageThree;

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8"
        }
      });
    }) as typeof fetch;

    await expect(fetchBestStoryIds("https://news.ycombinator.com/best?h=24", 5)).resolves.toEqual([
      101,
      102,
      103,
      104,
      105
    ]);
  });
});
