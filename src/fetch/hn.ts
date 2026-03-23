import { JSDOM } from "jsdom";
import sanitizeHtml from "sanitize-html";

import { HN_ITEM_ENDPOINT } from "../shared/constants.js";
import { sha256 } from "../shared/hash.js";
import type { CommentNode, HnItemRecord, StoryRecord } from "../shared/types.js";

const HN_BASE = "https://news.ycombinator.com";
const DEFAULT_TIMEOUT_MS = 15_000;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "a", "code", "pre", "ul", "ol", "li", "blockquote", "em", "strong", "i", "b", "br"],
  allowedAttributes: {
    a: ["href", "target", "rel"]
  },
  allowedSchemes: ["http", "https", "mailto"]
};

function buildHnUrl(id: number): string {
  return `${HN_BASE}/item?id=${id}`;
}

function toIsoTime(unixSeconds?: number): string {
  if (!unixSeconds) {
    return new Date(0).toISOString();
  }
  return new Date(unixSeconds * 1000).toISOString();
}

function getDomain(url: string): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function parseBestStoryIds(html: string, limit: number): number[] {
  const regex = /item\?id=(\d+)/g;
  const result: number[] = [];
  const seen = new Set<number>();
  let matched: RegExpExecArray | null = regex.exec(html);

  while (matched) {
    const id = Number.parseInt(matched[1], 10);
    if (Number.isFinite(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
      if (result.length >= limit) {
        break;
      }
    }
    matched = regex.exec(html);
  }

  return result;
}

export async function fetchBestStoryIds(listUrl: string, limit: number): Promise<number[]> {
  const response = await fetchWithTimeout(listUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch best list: ${response.status}`);
  }
  const html = await response.text();
  return parseBestStoryIds(html, limit);
}

export async function fetchItemById(id: number): Promise<HnItemRecord | null> {
  const response = await fetchWithTimeout(`${HN_ITEM_ENDPOINT}/${id}.json`);
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as HnItemRecord | null;
  return body;
}

export function sanitizeHnHtml(rawHtml?: string): string {
  if (!rawHtml) {
    return "";
  }
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

function pickSummaryParagraphs(text: string, maxParagraphs: number): string[] {
  const lines = text
    .split(/\n{2,}/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.slice(0, maxParagraphs);
}

export async function extractExternalSummary(url: string, maxParagraphs: number): Promise<string[]> {
  if (!/^https?:\/\//i.test(url)) {
    return [];
  }

  try {
    const response = await fetchWithTimeout(url, 18_000);
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const readabilityModule = await import("@mozilla/readability");
    const reader = new readabilityModule.Readability(dom.window.document);
    const article = reader.parse();

    if (article?.textContent) {
      const fromText = pickSummaryParagraphs(article.textContent, maxParagraphs);
      if (fromText.length > 0) {
        return fromText;
      }
    }

    const desc = dom.window.document.querySelector("meta[name='description']")?.getAttribute("content")?.trim();
    return desc ? [desc] : [];
  } catch {
    return [];
  }
}

async function buildCommentNode(commentId: number, parentId: number, level: number): Promise<CommentNode | null> {
  const item = await fetchItemById(commentId);
  if (!item) {
    return null;
  }

  const rawHtml = sanitizeHnHtml(item.text || "");
  const isDeleted = item.deleted || item.dead || item.type !== "comment";
  const textRawHtml = rawHtml || (isDeleted ? "<p>[deleted]</p>" : "");

  const childrenIds = item.kids ?? [];
  const childNodes = (
    await Promise.all(childrenIds.map((childId) => buildCommentNode(childId, item.id, level + 1)))
  ).filter((entry): entry is CommentNode => Boolean(entry));

  return {
    id: item.id,
    parentId,
    author: item.by ?? "[deleted]",
    publishedAt: toIsoTime(item.time),
    level,
    hnUrl: buildHnUrl(item.id),
    textRawHtml,
    textZhHtml: "",
    translationStatus: "raw_only",
    contentHash: sha256(textRawHtml),
    children: childNodes,
    isDeleted
  };
}

export async function buildCommentTree(story: HnItemRecord): Promise<CommentNode[]> {
  const childrenIds = story.kids ?? [];
  const tree = await Promise.all(childrenIds.map((commentId) => buildCommentNode(commentId, story.id, 1)));
  return tree.filter((entry): entry is CommentNode => Boolean(entry));
}

export async function buildStoryRecord(storyId: number, rank: number, summaryMaxParagraphs: number): Promise<StoryRecord | null> {
  const item = await fetchItemById(storyId);
  if (!item || item.type !== "story") {
    return null;
  }

  const textRawHtml = sanitizeHnHtml(item.text || "");
  const url = item.url ?? "";
  const summaryRaw = url ? await extractExternalSummary(url, summaryMaxParagraphs) : [];
  const comments = await buildCommentTree(item);

  const story: StoryRecord = {
    id: item.id,
    rank,
    type: item.type ?? "story",
    title: item.title ?? "(untitled)",
    titleZh: "",
    url,
    domain: getDomain(url),
    hnUrl: buildHnUrl(item.id),
    author: item.by ?? "unknown",
    score: item.score ?? 0,
    publishedAt: toIsoTime(item.time),
    commentsCount: item.descendants ?? comments.length,
    textRawHtml,
    textZhHtml: "",
    summaryRaw,
    summaryZh: [],
    translationStatus: "raw_only",
    contentHash: sha256(`${item.title ?? ""}\n${textRawHtml}\n${summaryRaw.join("\n")}`),
    comments
  };

  return story;
}
