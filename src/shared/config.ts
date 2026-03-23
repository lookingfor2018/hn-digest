import "dotenv/config";

import path from "node:path";

import {
  DEFAULT_ARTICLE_SUMMARY_MAX_PARAGRAPHS,
  DEFAULT_BARK_ICON_URL,
  DEFAULT_BARK_SERVER,
  DEFAULT_COMMENT_TRANSLATION_CHAR_BUDGET,
  DEFAULT_HISTORY_DAYS,
  DEFAULT_LIMIT,
  DEFAULT_LIST_URL,
  DEFAULT_TIMEZONE
} from "./constants.js";
import { formatBatchId, resolveSlot } from "./time.js";
import type { AppEnv, CliOptions, ProjectPaths, RunConfig, RunMode, RunSlot } from "./types.js";

function parseInteger(value: string | undefined, fallbackValue: number): number {
  if (!value) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    switch (token) {
      case "--mode":
        options.mode = value as RunMode;
        index += 1;
        break;
      case "--slot":
        options.slot = value as RunSlot;
        index += 1;
        break;
      case "--limit":
        options.limit = parseInteger(value, DEFAULT_LIMIT);
        index += 1;
        break;
      case "--list-url":
        options.listUrl = value;
        index += 1;
        break;
      case "--batch-id":
        options.batchId = value;
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-push":
        options.skipPush = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function deriveSiteBaseUrl(): string {
  const envValue = process.env.SITE_BASE_URL?.trim();
  if (envValue) {
    return envValue.endsWith("/") ? envValue : `${envValue}/`;
  }

  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!repo || !repo.includes("/")) {
    return "https://example.github.io/hacker-news-digest/";
  }

  const [owner, repository] = repo.split("/");
  return `https://${owner}.github.io/${repository}/`;
}

export function getProjectPaths(rootDir: string = process.cwd()): ProjectPaths {
  return {
    rootDir,
    stateDir: path.join(rootDir, "state"),
    distDir: path.join(rootDir, "dist")
  };
}

export function loadAppEnv(): AppEnv {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    openAiBaseUrl: process.env.OPENAI_BASE_URL?.trim() ?? "https://api.openai.com/v1",
    openAiModel: process.env.OPENAI_MODEL?.trim() ?? "gpt-5.3",
    siteBaseUrl: deriveSiteBaseUrl(),
    barkServer: process.env.BARK_SERVER?.trim() ?? DEFAULT_BARK_SERVER,
    barkRecipientsFile: process.env.BARK_RECIPIENTS_FILE?.trim(),
    barkRecipientNames: parseList(process.env.BARK_RECIPIENT_NAMES),
    barkNamedKeys: process.env.BARK_NAMED_KEYS?.trim(),
    barkIconUrl: process.env.BARK_ICON_URL?.trim() ?? DEFAULT_BARK_ICON_URL,
    listUrl: process.env.LIST_URL?.trim() ?? DEFAULT_LIST_URL,
    historyDays: parseInteger(process.env.HISTORY_DAYS, DEFAULT_HISTORY_DAYS),
    articleSummaryMaxParagraphs: parseInteger(
      process.env.ARTICLE_SUMMARY_MAX_PARAGRAPHS,
      DEFAULT_ARTICLE_SUMMARY_MAX_PARAGRAPHS
    ),
    commentTranslationCharBudget: parseInteger(
      process.env.COMMENT_TRANSLATION_CHAR_BUDGET,
      DEFAULT_COMMENT_TRANSLATION_CHAR_BUDGET
    )
  };
}

export function createRunConfig(argv: string[] = process.argv.slice(2), now: Date = new Date()): RunConfig {
  const cliOptions = parseCliArgs(argv);
  const env = loadAppEnv();
  const mode = cliOptions.mode ?? "manual";
  const slot = resolveSlot(mode, cliOptions.slot, now);

  return {
    mode,
    timezone: DEFAULT_TIMEZONE,
    slot,
    batchId: cliOptions.batchId ?? formatBatchId(now),
    listUrl: cliOptions.listUrl ?? env.listUrl,
    limit: cliOptions.limit ?? DEFAULT_LIMIT,
    historyDays: env.historyDays,
    siteBaseUrl: env.siteBaseUrl,
    articleSummaryMaxParagraphs: env.articleSummaryMaxParagraphs,
    generatedAt: now.toISOString(),
    commentTranslationCharBudget: env.commentTranslationCharBudget,
    dryRun: cliOptions.dryRun ?? false,
    skipPush: cliOptions.skipPush ?? false
  };
}
