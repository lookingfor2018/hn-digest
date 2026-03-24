import { afterEach, describe, expect, it, vi } from "vitest";

import { translateStories } from "../src/translate/index.js";
import { translateTextWithFallback } from "../src/translate/providers/translator.js";
import type { AppEnv, RunConfig, StateBundle, StoryRecord } from "../src/shared/types.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const env: AppEnv = {
  openAiApiKey: "sk-test",
  openAiBaseUrl: "https://gmn.chuangzuoli.com/v1",
  openAiModel: "gpt-5.3",
  siteBaseUrl: "https://example.github.io/hn/",
  barkServer: "https://api.day.app",
  barkRecipientNames: [],
  barkIconUrl: "",
  listUrl: "https://news.ycombinator.com/best?h=24",
  historyDays: 7,
  articleSummaryMaxParagraphs: 5,
  commentTranslationCharBudget: 20
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
  commentTranslationCharBudget: 20,
  dryRun: true,
  skipPush: true
};

function makeState(): StateBundle {
  return {
    translationCache: { version: 1, entries: {} },
    pushHistory: { version: 1, entries: [] },
    batches: { version: 1, latestBatchId: null, entries: [] }
  };
}

describe("translate fallback", () => {
  it("falls back to google translate when openai endpoint fails", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/chat/completions")) {
        return new Response("upstream failed", { status: 500 });
      }
      if (url.includes("translate.googleapis.com")) {
        const u = new URL(url);
        const q = u.searchParams.get("q") || "";
        return new Response(JSON.stringify([[[`中:${q}`, q, null, null]]]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fakeFetch);

    const result = await translateTextWithFallback("visit https://example.com", {
      apiKey: env.openAiApiKey,
      baseUrl: env.openAiBaseUrl,
      model: env.openAiModel
    });

    expect(result.provider).toBe("google");
    expect(result.text).toContain("https://example.com");
  });

  it("splits google fallback payload when long query returns 400", async () => {
    const source = "a".repeat(420);
    const googleQueryLengths: number[] = [];
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/chat/completions")) {
        return new Response("upstream failed", { status: 500 });
      }
      if (url.includes("translate.googleapis.com")) {
        const u = new URL(url);
        const q = u.searchParams.get("q") || "";
        googleQueryLengths.push(q.length);
        if (q.length > 100) {
          return new Response("too long", { status: 400 });
        }
        return new Response(JSON.stringify([[[q, q, null, null]]]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fakeFetch);

    const result = await translateTextWithFallback(source, {
      apiKey: env.openAiApiKey,
      baseUrl: env.openAiBaseUrl,
      model: env.openAiModel
    });

    expect(result.provider).toBe("google");
    expect(result.text).toBe(source);
    expect(googleQueryLengths.some((len) => len > 100)).toBe(true);
    expect(googleQueryLengths.some((len) => len <= 100)).toBe(true);
  });

  it("returns source text when both translators fail", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/chat/completions")) {
        return new Response("upstream failed", { status: 500 });
      }
      if (url.includes("translate.googleapis.com")) {
        return new Response("still failed", { status: 400 });
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fakeFetch);

    const source = "visit https://example.com";
    const result = await translateTextWithFallback(source, {
      apiKey: env.openAiApiKey,
      baseUrl: env.openAiBaseUrl,
      model: env.openAiModel
    });

    expect(result.provider).toBe("google");
    expect(result.text).toBe(source);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("translates story html and applies comment budget in BFS order", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/chat/completions")) {
        return new Response("upstream failed", { status: 500 });
      }
      if (url.includes("translate.googleapis.com")) {
        const u = new URL(url);
        const q = u.searchParams.get("q") || "";
        return new Response(JSON.stringify([[[`译:${q}`, q, null, null]]]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fakeFetch);

    const stories: StoryRecord[] = [
      {
        id: 100,
        rank: 1,
        type: "story",
        title: "Use `npm i` with API at https://example.com",
        titleZh: "",
        url: "",
        domain: "",
        hnUrl: "https://news.ycombinator.com/item?id=100",
        author: "alice",
        score: 10,
        publishedAt: "2026-03-22T00:00:00.000Z",
        commentsCount: 2,
        textRawHtml: "<p>Try `npm i` now</p>",
        textZhHtml: "",
        summaryRaw: [],
        summaryZh: [],
        translationStatus: "raw_only",
        contentHash: "h",
        comments: [
          {
            id: 201,
            parentId: 100,
            author: "b",
            publishedAt: "2026-03-22T00:00:00.000Z",
            level: 1,
            hnUrl: "https://news.ycombinator.com/item?id=201",
            textRawHtml: "<p>short</p>",
            textZhHtml: "",
            translationStatus: "raw_only",
            contentHash: "c1",
            children: [
              {
                id: 202,
                parentId: 201,
                author: "c",
                publishedAt: "2026-03-22T00:00:00.000Z",
                level: 2,
                hnUrl: "https://news.ycombinator.com/item?id=202",
                textRawHtml: "<p>this comment is too long for remaining budget</p>",
                textZhHtml: "",
                translationStatus: "raw_only",
                contentHash: "c2",
                children: []
              }
            ]
          }
        ]
      }
    ];

    const translated = await translateStories(stories, config, makeState(), env);
    const story = translated.stories[0];

    expect(story.titleZh).toContain("https://example.com");
    expect(story.textZhHtml).toContain("`npm i`");
    expect(story.comments[0].translationStatus).toBe("translated");
    expect(story.comments[0].children[0].translationStatus).toBe("skipped_budget");
  });
});
