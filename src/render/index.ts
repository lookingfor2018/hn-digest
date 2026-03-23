import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";

import type { BatchManifest, BatchManifestStory, CommentNode, ProjectPaths, RunConfig, StoryRecord } from "../shared/types.js";

export interface RenderResult {
  manifest: BatchManifest;
}

const BASE_ALLOWED_TAGS = ["p", "a", "code", "pre", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "br", "span"];

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function formatChinaTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function relativeAge(value: string, nowIso: string): string {
  const now = new Date(nowIso).getTime();
  const then = new Date(value).getTime();
  if (!Number.isFinite(now) || !Number.isFinite(then)) {
    return "-";
  }
  const diffMinutes = Math.max(1, Math.floor((now - then) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeRichHtml(value: string): string {
  return sanitizeHtml(value || "", {
    allowedTags: BASE_ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["class"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href || "#",
          target: "_blank",
          rel: "noopener noreferrer"
        }
      })
    }
  });
}

function renderSummaryList(items: string[], title: string): string {
  if (!items.length) {
    return `<section class="block"><h3>${escapeHtml(title)}</h3><p class="muted">暂无内容</p></section>`;
  }
  const list = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<section class="block"><h3>${escapeHtml(title)}</h3><ol class="summary-list">${list}</ol></section>`;
}

function renderCommentNode(node: CommentNode): string {
  const openAttr = node.level <= 1 ? " open" : "";
  const safeZh = sanitizeRichHtml(node.textZhHtml || "<p>（暂无译文）</p>");
  const safeRaw = sanitizeRichHtml(node.textRawHtml || "<p>（原文缺失）</p>");
  const deletedBadge = node.isDeleted ? `<span class="badge">deleted</span>` : "";
  const children = node.children.map((item) => renderCommentNode(item)).join("");
  const indentClass = `depth-${Math.min(node.level, 3)}`;

  return `
    <details class="comment-node ${indentClass}"${openAttr}>
      <summary>
        <span class="meta-author">${escapeHtml(node.author || "unknown")}</span>
        <span class="meta-time">${escapeHtml(formatChinaTime(node.publishedAt))}</span>
        ${deletedBadge}
      </summary>
      <article class="comment-card">
        <div class="comment-text is-clamped" data-role="comment-zh">${safeZh}</div>
        <div class="comment-text is-hidden" data-role="comment-raw">${safeRaw}</div>
        <div class="comment-actions">
          <button type="button" class="btn ghost" data-action="toggle-raw">查看原文</button>
          <button type="button" class="btn ghost" data-action="toggle-expand">展开全文</button>
          <a class="btn ghost" href="${escapeHtml(node.hnUrl)}" target="_blank" rel="noopener noreferrer">在 HN 中查看</a>
        </div>
        ${children ? `<div class="comment-children">${children}</div>` : ""}
      </article>
    </details>
  `;
}

function renderStoryPage(story: StoryRecord, config: RunConfig): string {
  const hasExternal = Boolean(story.url);
  const summaryBlock = hasExternal
    ? `
      ${renderSummaryList(story.summaryZh, "中文摘要")}
      ${renderSummaryList(story.summaryRaw, "Original Summary")}
    `
    : `
      <section class="block">
        <h3>正文（中文）</h3>
        <div class="post-body" data-role="story-zh">${sanitizeRichHtml(story.textZhHtml)}</div>
        <div class="post-body is-hidden" data-role="story-raw">${sanitizeRichHtml(story.textRawHtml)}</div>
        <button type="button" class="btn ghost" data-action="toggle-story-raw">查看原文</button>
      </section>
    `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(story.titleZh || story.title)} | HN 精选</title>
  <style>${buildStyle()}</style>
</head>
<body data-page="story">
  <main class="page story-page">
    <header class="hero">
      <a class="back-link" href="${escapeHtml(new URL(`batches/${config.batchId}/`, ensureTrailingSlash(config.siteBaseUrl)).toString())}">返回本批次</a>
      <h1>${escapeHtml(story.titleZh || story.title)}</h1>
      <p class="subtitle">${escapeHtml(story.title)}</p>
      <div class="meta-line">
        <span>${escapeHtml(story.domain || "news.ycombinator.com")}</span>
        <span>作者 ${escapeHtml(story.author || "-")}</span>
        <span>分数 ${story.score}</span>
        <span>评论 ${story.commentsCount}</span>
        <span>${escapeHtml(formatChinaTime(story.publishedAt))}</span>
      </div>
      <div class="hero-actions">
        <a class="btn" href="${escapeHtml(story.hnUrl)}" target="_blank" rel="noopener noreferrer">打开 HN 原帖</a>
        ${hasExternal ? `<a class="btn" href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer">打开原始文章</a>` : ""}
      </div>
    </header>
    ${summaryBlock}
    <section class="block comments">
      <h3>评论（默认中文）</h3>
      <div class="comment-tree">
        ${story.comments.map((node) => renderCommentNode(node)).join("") || "<p class=\"muted\">暂无评论</p>"}
      </div>
    </section>
  </main>
  <script>${buildScript()}</script>
</body>
</html>`;
}

function renderBatchListPage(stories: StoryRecord[], config: RunConfig): string {
  const cards = stories
    .map((story) => {
      const storyUrl = new URL(`stories/${story.id}.html`, ensureTrailingSlash(config.siteBaseUrl)).toString();
      return `
      <article class="story-card">
        <div class="rank">#${story.rank}</div>
        <div class="story-main">
          <h2><a href="${escapeHtml(storyUrl)}">${escapeHtml(story.titleZh || story.title)}</a></h2>
          <p class="subtitle">${escapeHtml(story.title)}</p>
          <div class="meta-line">
            <span>${story.score} points</span>
            <span>${escapeHtml(story.author || "-")}</span>
            <span>${escapeHtml(relativeAge(story.publishedAt, config.generatedAt))}</span>
            <span>${story.commentsCount} comments</span>
            <span>${escapeHtml(story.domain || "-")}</span>
          </div>
          <div class="story-actions">
            <a class="btn" href="${escapeHtml(storyUrl)}">查看详情</a>
            <a class="btn ghost" href="${escapeHtml(story.hnUrl)}" target="_blank" rel="noopener noreferrer">打开 HN 原帖</a>
            ${story.url ? `<a class="btn ghost" href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer">打开原始文章</a>` : ""}
          </div>
        </div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HN 精选 ${escapeHtml(config.batchId)}</title>
  <style>${buildStyle()}</style>
</head>
<body data-page="batch">
  <main class="page">
    <header class="hero">
      <h1>Hacker News 精选推送</h1>
      <p class="subtitle">过去 24 小时最佳前 ${stories.length} 条 | 批次 ${escapeHtml(config.batchId)}</p>
      <div class="meta-line">
        <span>北京时间 ${escapeHtml(formatChinaTime(config.generatedAt))}</span>
        <span>时段 ${escapeHtml(config.slot)}</span>
      </div>
    </header>
    <section class="story-list">
      ${cards}
    </section>
  </main>
  <script>${buildScript()}</script>
</body>
</html>`;
}

function renderRootIndex(config: RunConfig): string {
  const batchPath = `batches/${config.batchId}/`;
  const batchUrl = new URL(batchPath, ensureTrailingSlash(config.siteBaseUrl)).toString();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(batchUrl)}">
  <title>HN 精选最新批次</title>
  <style>${buildStyle()}</style>
</head>
<body>
  <main class="page redirect-page">
    <h1>正在跳转到最新批次</h1>
    <p>如果没有自动跳转，请点击下方链接：</p>
    <a class="btn" href="${escapeHtml(batchUrl)}">${escapeHtml(batchUrl)}</a>
  </main>
</body>
</html>`;
}

function buildStyle(): string {
  return `
  :root {
    --bg: radial-gradient(1200px 600px at 0% 0%, #f7f1e3 0%, #f8f6f0 45%, #f4efe6 100%);
    --paper: #fffaf2;
    --ink: #2a2117;
    --muted: #6f6355;
    --accent: #ff6600;
    --accent-soft: #ffe2cc;
    --line: #eadfce;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "IBM Plex Sans", "Noto Sans SC", "PingFang SC", sans-serif;
    line-height: 1.6;
  }
  .page {
    width: min(860px, 100%);
    margin: 0 auto;
    padding: 16px 14px 72px;
  }
  .hero, .block, .story-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(63, 41, 18, 0.08);
  }
  .hero, .block { padding: 16px; margin-bottom: 12px; }
  .hero h1 { margin: 0; font-size: 1.24rem; letter-spacing: 0.01em; }
  .subtitle { margin: 6px 0 0; color: var(--muted); font-size: 0.96rem; }
  .meta-line { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px 12px; font-size: 0.84rem; color: var(--muted); }
  .story-list { display: grid; gap: 12px; }
  .story-card { display: grid; grid-template-columns: 48px 1fr; gap: 10px; padding: 14px; }
  .rank {
    align-self: start;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: 12px;
    text-align: center;
    padding: 3px 0;
  }
  .story-card h2 { margin: 0; font-size: 1.02rem; }
  .story-card h2 a { color: inherit; text-decoration: none; }
  .story-card h2 a:hover { text-decoration: underline; }
  .story-actions, .hero-actions, .comment-actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
  .btn {
    appearance: none;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    border-radius: 10px;
    padding: 7px 11px;
    font-size: 0.86rem;
    text-decoration: none;
    cursor: pointer;
    line-height: 1.2;
  }
  .btn.ghost {
    background: #fff6ee;
    color: #8a430c;
    border-color: #efc8ad;
  }
  .block h3 { margin: 0 0 10px; font-size: 1rem; }
  .summary-list { margin: 0; padding-left: 20px; }
  .summary-list li + li { margin-top: 8px; }
  .post-body { font-size: 1rem; }
  .post-body code, .comment-text code { background: #f4eadf; padding: 1px 4px; border-radius: 5px; }
  .post-body pre, .comment-text pre {
    overflow-x: auto;
    padding: 10px;
    border-radius: 10px;
    background: #2a2117;
    color: #f8eee2;
  }
  .comment-tree { display: grid; gap: 8px; }
  .comment-node {
    border-left: 2px solid var(--line);
    padding-left: 10px;
    margin-left: 0;
  }
  .comment-node.depth-2 { border-left-color: #e6cdb7; }
  .comment-node.depth-3 { border-left-color: #d9b79a; background: rgba(255, 232, 214, 0.3); border-radius: 8px; }
  .comment-node > summary {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    cursor: pointer;
    font-size: 0.84rem;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .comment-node > summary::-webkit-details-marker { display: none; }
  .comment-card { padding-bottom: 8px; }
  .comment-text { font-size: 0.95rem; }
  .comment-text.is-clamped {
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .is-hidden { display: none; }
  .muted { color: var(--muted); font-size: 0.9rem; }
  .badge { background: #eee1d6; border-radius: 6px; padding: 1px 6px; font-size: 0.75rem; }
  .back-link { display: inline-block; margin-bottom: 8px; color: #8a430c; text-decoration: none; font-size: 0.9rem; }
  .redirect-page { min-height: 65vh; display: grid; place-content: center; text-align: center; gap: 8px; }
  @media (min-width: 900px) {
    .page { padding-top: 26px; }
  }
  `;
}

function buildScript(): string {
  return `
  (() => {
    function bindToggleRaw(button) {
      button.addEventListener("click", () => {
        const card = button.closest(".comment-card");
        if (!card) return;
        const zh = card.querySelector('[data-role="comment-zh"]');
        const raw = card.querySelector('[data-role="comment-raw"]');
        if (!zh || !raw) return;
        const showRaw = raw.classList.contains("is-hidden");
        zh.classList.toggle("is-hidden", showRaw);
        raw.classList.toggle("is-hidden", !showRaw);
        button.textContent = showRaw ? "查看译文" : "查看原文";
      });
    }
    function bindToggleExpand(button) {
      button.addEventListener("click", () => {
        const card = button.closest(".comment-card");
        if (!card) return;
        const block = card.querySelector(".comment-text:not(.is-hidden)");
        if (!block) return;
        const isClamped = block.classList.contains("is-clamped");
        block.classList.toggle("is-clamped", !isClamped);
        button.textContent = isClamped ? "收起" : "展开全文";
      });
    }
    function bindStoryRaw(button) {
      button.addEventListener("click", () => {
        const root = document.querySelector(".story-page");
        if (!root) return;
        const zh = root.querySelector('[data-role="story-zh"]');
        const raw = root.querySelector('[data-role="story-raw"]');
        if (!zh || !raw) return;
        const showRaw = raw.classList.contains("is-hidden");
        zh.classList.toggle("is-hidden", showRaw);
        raw.classList.toggle("is-hidden", !showRaw);
        button.textContent = showRaw ? "查看译文" : "查看原文";
      });
    }

    document.querySelectorAll('[data-action="toggle-raw"]').forEach((el) => bindToggleRaw(el));
    document.querySelectorAll('[data-action="toggle-expand"]').forEach((el) => bindToggleExpand(el));
    document.querySelectorAll('[data-action="toggle-story-raw"]').forEach((el) => bindStoryRaw(el));
  })();
  `;
}

export async function renderSite(
  stories: StoryRecord[],
  config: RunConfig,
  paths: ProjectPaths
): Promise<RenderResult> {
  const baseUrl = ensureTrailingSlash(config.siteBaseUrl);
  const batchUrl = new URL(`batches/${config.batchId}/`, baseUrl).toString();

  const manifestStories: BatchManifestStory[] = stories.map((story) => ({
    id: story.id,
    rank: story.rank,
    title: story.title,
    titleZh: story.titleZh,
    storyUrl: new URL(`stories/${story.id}.html`, baseUrl).toString(),
    hnUrl: story.hnUrl,
    sourceUrl: story.url,
    commentsCount: story.commentsCount,
    translationStatus: story.translationStatus
  }));

  const manifest: BatchManifest = {
    batchId: config.batchId,
    timezone: config.timezone,
    slot: config.slot,
    generatedAt: config.generatedAt,
    storyCount: stories.length,
    latestIndexUrl: baseUrl,
    batchUrl,
    stories: manifestStories,
    push: {
      status: "pending",
      messageUrl: batchUrl
    }
  };

  const batchDir = path.join(paths.distDir, "batches", config.batchId);
  const storiesDir = path.join(paths.distDir, "stories");
  await Promise.all([mkdir(paths.distDir, { recursive: true }), mkdir(batchDir, { recursive: true }), mkdir(storiesDir, { recursive: true })]);

  await Promise.all(
    stories.map((story) =>
      writeFile(path.join(storiesDir, `${story.id}.html`), renderStoryPage(story, config), "utf8")
    )
  );

  await Promise.all([
    writeFile(path.join(paths.distDir, "index.html"), renderRootIndex(config), "utf8"),
    writeFile(path.join(batchDir, "index.html"), renderBatchListPage(stories, config), "utf8"),
    writeFile(path.join(batchDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  ]);

  return { manifest };
}
