import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchStories } from "../src/fetch/index.js";
import type { AppEnv, RunConfig } from "../src/shared/types.js";

const env: AppEnv = {
  openAiApiKey: "",
  openAiBaseUrl: "https://example.com/v1",
  openAiModel: "gpt-5.3",
  siteBaseUrl: "https://example.github.io/hn/",
  barkServer: "https://api.day.app",
  barkRecipientNames: [],
  barkIconUrl: "",
  listUrl: "https://news.ycombinator.com/best?h=24",
  historyDays: 7,
  articleSummaryMaxParagraphs: 5,
  commentTranslationCharBudget: 1000
};

const config: RunConfig = {
  mode: "manual",
  timezone: "Asia/Shanghai",
  slot: "manual",
  batchId: "2026-03-22-0800",
  listUrl: "https://news.ycombinator.com/best?h=24",
  limit: 50,
  historyDays: 7,
  siteBaseUrl: "https://example.github.io/hn/",
  articleSummaryMaxParagraphs: 5,
  generatedAt: "2026-03-22T00:00:00.000Z",
  commentTranslationCharBudget: 1000,
  dryRun: true,
  skipPush: true
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchStories", () => {
  it("builds story records and nested comment tree", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("best?h=24")) {
        return new Response('<a href="item?id=1">story</a>', { status: 200 });
      }
      if (url.endsWith("/1.json")) {
        return new Response(
          JSON.stringify({
            id: 1,
            type: "story",
            title: "Hello HN",
            by: "alice",
            score: 12,
            time: 1700000000,
            kids: [2],
            descendants: 2,
            text: "<p>Root text</p>"
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/2.json")) {
        return new Response(
          JSON.stringify({
            id: 2,
            type: "comment",
            by: "bob",
            parent: 1,
            time: 1700000010,
            text: "<p>Top comment</p>",
            kids: [3]
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/3.json")) {
        return new Response(
          JSON.stringify({
            id: 3,
            type: "comment",
            by: "carl",
            parent: 2,
            time: 1700000020,
            text: "<p>Nested</p>"
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fakeFetch);
    const stories = await fetchStories(config, env);
    expect(stories).toHaveLength(1);
    expect(stories[0].id).toBe(1);
    expect(stories[0].comments).toHaveLength(1);
    expect(stories[0].comments[0].children).toHaveLength(1);
    expect(stories[0].comments[0].children[0].id).toBe(3);
  });
});
