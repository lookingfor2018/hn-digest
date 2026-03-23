import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __notifyInternals, notifyBatch } from "../src/notify/index.js";
import type { AppEnv, BatchManifest, RunConfig, StateBundle } from "../src/shared/types.js";

function createConfig(): RunConfig {
  return {
    mode: "manual",
    timezone: "Asia/Shanghai",
    slot: "manual",
    batchId: "2026-03-22-1200",
    listUrl: "https://news.ycombinator.com/best?h=24",
    limit: 50,
    historyDays: 7,
    siteBaseUrl: "https://example.github.io/hn/",
    articleSummaryMaxParagraphs: 5,
    generatedAt: "2026-03-22T04:00:00.000Z",
    commentTranslationCharBudget: 220000,
    dryRun: false,
    skipPush: false
  };
}

function createManifest(batchId = "2026-03-22-1200"): BatchManifest {
  return {
    batchId,
    timezone: "Asia/Shanghai",
    slot: "12:00",
    generatedAt: "2026-03-22T04:00:00.000Z",
    storyCount: 50,
    latestIndexUrl: "https://example.github.io/hn/",
    batchUrl: `https://example.github.io/hn/batches/${batchId}/`,
    stories: [],
    push: { status: "pending" }
  };
}

function createState(): StateBundle {
  return {
    translationCache: { version: 1, entries: {} },
    pushHistory: { version: 1, entries: [] },
    batches: { version: 1, latestBatchId: null, entries: [] }
  };
}

function createEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    openAiApiKey: "",
    openAiBaseUrl: "https://example.com/v1",
    openAiModel: "gpt-5.3",
    siteBaseUrl: "https://example.github.io/hn/",
    barkServer: "https://api.day.app",
    barkRecipientsFile: "",
    barkRecipientNames: ["liyu"],
    barkNamedKeys: "",
    barkIconUrl: "https://news.ycombinator.com/y18.svg",
    listUrl: "https://news.ycombinator.com/best?h=24",
    historyDays: 7,
    articleSummaryMaxParagraphs: 5,
    commentTranslationCharBudget: 220000,
    ...overrides
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notify bark", () => {
  it("优先从 CSV 解析 liyu 收件人", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hn-notify-"));
    const csvPath = path.join(tempDir, "recipients.csv");
    await writeFile(
      csvPath,
      "name,address,region\nliyu,csv_key,Shanghai\nalice,alice_key,Shanghai\n",
      "utf8"
    );

    const recipients = await __notifyInternals.resolveRecipients(
      createEnv({
        barkRecipientsFile: csvPath,
        barkNamedKeys: "liyu:named_key"
      })
    );

    expect(recipients).toEqual([{ name: "liyu", key: "csv_key" }]);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("同一 batchId 已发送时跳过推送并记录历史", async () => {
    const state = createState();
    state.pushHistory.entries.push({
      batchId: "2026-03-22-1200",
      status: "sent",
      messageUrl: "https://example.github.io/hn/batches/2026-03-22-1200/"
    });

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await notifyBatch(createManifest(), createConfig(), state, createEnv());
    expect(result.status).toBe("skipped_duplicate");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.state.pushHistory.entries[0]?.status).toBe("skipped_duplicate");
  });

  it("发送 payload 包含 title/body/url/icon 且可用 named keys 兜底", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, message: "success" })
    });
    vi.stubGlobal("fetch", fetchSpy);

    const state = createState();
    const env = createEnv({
      barkRecipientNames: ["liyu"],
      barkRecipientsFile: "",
      barkNamedKeys: "liyu:fallback_key",
      barkIconUrl: "https://news.ycombinator.com/logo.svg",
      barkServer: "https://api.day.app/"
    });

    const result = await notifyBatch(createManifest(), createConfig(), state, env);
    expect(result.status).toBe("sent");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.day.app/push");

    const payload = JSON.parse(String(requestInit.body)) as Record<string, string>;
    expect(payload.device_key).toBe("fallback_key");
    expect(payload.icon).toBe("https://news.ycombinator.com/logo.svg");
    expect(payload.url).toBe("https://example.github.io/hn/batches/2026-03-22-1200/");
    expect(payload.title).toContain("HN 精选已更新 |");
    expect(payload.body).toBe("前 50 条帖子与评论翻译已生成");
  });
});
