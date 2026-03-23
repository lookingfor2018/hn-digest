import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderSite } from "../src/render/index.js";
import type { ProjectPaths, RunConfig, StoryRecord } from "../src/shared/types.js";

const tempDirs: string[] = [];

async function createTempPaths(): Promise<ProjectPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), "hn-render-"));
  tempDirs.push(root);
  return {
    rootDir: root,
    stateDir: path.join(root, "state"),
    distDir: path.join(root, "dist")
  };
}

function buildConfig(): RunConfig {
  return {
    mode: "manual",
    timezone: "Asia/Shanghai",
    slot: "manual",
    batchId: "2026-03-22-1200",
    listUrl: "https://news.ycombinator.com/best?h=24",
    limit: 50,
    historyDays: 7,
    siteBaseUrl: "https://example.github.io/hn-digest/",
    articleSummaryMaxParagraphs: 5,
    generatedAt: "2026-03-22T04:00:00.000Z",
    commentTranslationCharBudget: 220000,
    dryRun: false,
    skipPush: false
  };
}

function buildStories(): StoryRecord[] {
  return [
    {
      id: 1001,
      rank: 1,
      type: "story",
      title: "Show HN: Cool DB",
      titleZh: "Show HN: 很酷的数据库",
      url: "https://example.com/post",
      domain: "example.com",
      hnUrl: "https://news.ycombinator.com/item?id=1001",
      author: "alice",
      score: 321,
      publishedAt: "2026-03-22T03:00:00.000Z",
      commentsCount: 2,
      textRawHtml: "",
      textZhHtml: "",
      summaryRaw: ["One key point", "Another key point"],
      summaryZh: ["第一条要点", "第二条要点"],
      translationStatus: "translated",
      contentHash: "hash-story",
      comments: [
        {
          id: 2001,
          parentId: 1001,
          author: "bob",
          publishedAt: "2026-03-22T03:15:00.000Z",
          level: 1,
          hnUrl: "https://news.ycombinator.com/item?id=2001",
          textRawHtml: "<p>Original comment body</p>",
          textZhHtml: "<p>中文评论正文</p>",
          translationStatus: "translated",
          contentHash: "hash-c1",
          children: [
            {
              id: 2002,
              parentId: 2001,
              author: "charlie",
              publishedAt: "2026-03-22T03:18:00.000Z",
              level: 2,
              hnUrl: "https://news.ycombinator.com/item?id=2002",
              textRawHtml: "<p>Nested original comment</p>",
              textZhHtml: "<p>嵌套评论</p>",
              translationStatus: "translated",
              contentHash: "hash-c2",
              children: []
            }
          ]
        }
      ]
    }
  ];
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("renderSite", () => {
  it("生成 manifest 与必需文件结构", async () => {
    const paths = await createTempPaths();
    const config = buildConfig();
    const stories = buildStories();

    const result = await renderSite(stories, config, paths);
    const manifestPath = path.join(paths.distDir, "batches", config.batchId, "manifest.json");
    const manifestRaw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as { batchId: string; stories: Array<{ id: number }>; batchUrl: string };

    expect(result.manifest.batchId).toBe(config.batchId);
    expect(manifest.batchId).toBe(config.batchId);
    expect(manifest.stories[0].id).toBe(1001);
    expect(manifest.batchUrl).toBe("https://example.github.io/hn-digest/batches/2026-03-22-1200/");
  });

  it("批次页包含三入口按钮与中文优先标题", async () => {
    const paths = await createTempPaths();
    const config = buildConfig();

    await renderSite(buildStories(), config, paths);

    const batchPath = path.join(paths.distDir, "batches", config.batchId, "index.html");
    const html = await readFile(batchPath, "utf8");

    expect(html).toContain("Show HN: 很酷的数据库");
    expect(html).toContain("Show HN: Cool DB");
    expect(html).toContain("查看详情");
    expect(html).toContain("打开 HN 原帖");
    expect(html).toContain("打开原始文章");
  });

  it("详情页包含评论交互钩子，且二级评论默认折叠", async () => {
    const paths = await createTempPaths();
    const config = buildConfig();

    await renderSite(buildStories(), config, paths);

    const storyPath = path.join(paths.distDir, "stories", "1001.html");
    const html = await readFile(storyPath, "utf8");

    expect(html).toContain('data-action="toggle-raw"');
    expect(html).toContain('data-action="toggle-expand"');
    expect(html).toContain('data-action="toggle-story-raw"');
    expect(html).toContain('class="comment-node depth-2"');
    expect(html).toContain('<details class="comment-node depth-2">');
  });
});
