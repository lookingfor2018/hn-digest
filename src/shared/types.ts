export type RunMode = "scheduled" | "manual";
export type ScheduledSlot = "08:00" | "12:00" | "15:00";
export type RunSlot = ScheduledSlot | "manual";

export type TranslationStatus =
  | "translated"
  | "partial"
  | "raw_only"
  | "cached"
  | "skipped_budget"
  | "failed";

export type PushStatus =
  | "pending"
  | "sent"
  | "failed"
  | "skipped_duplicate";

export interface AppEnv {
  openAiApiKey: string;
  openAiBaseUrl: string;
  openAiModel: string;
  siteBaseUrl: string;
  barkServer: string;
  barkRecipientsFile?: string;
  barkRecipientNames: string[];
  barkNamedKeys?: string;
  barkIconUrl: string;
  listUrl: string;
  historyDays: number;
  articleSummaryMaxParagraphs: number;
  commentTranslationCharBudget: number;
}

export interface CliOptions {
  mode?: RunMode;
  slot?: RunSlot;
  limit?: number;
  listUrl?: string;
  dryRun?: boolean;
  skipPush?: boolean;
  batchId?: string;
}

export interface RunConfig {
  mode: RunMode;
  timezone: string;
  slot: RunSlot;
  batchId: string;
  listUrl: string;
  limit: number;
  historyDays: number;
  siteBaseUrl: string;
  articleSummaryMaxParagraphs: number;
  generatedAt: string;
  commentTranslationCharBudget: number;
  dryRun: boolean;
  skipPush: boolean;
}

export interface HnItemRecord {
  id: number;
  by?: string;
  descendants?: number;
  kids?: number[];
  score?: number;
  text?: string;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
  dead?: boolean;
  deleted?: boolean;
  parent?: number;
}

export interface CommentNode {
  id: number;
  parentId: number;
  author: string;
  publishedAt: string;
  level: number;
  hnUrl: string;
  textRawHtml: string;
  textZhHtml: string;
  translationStatus: TranslationStatus;
  contentHash: string;
  children: CommentNode[];
  isDeleted?: boolean;
}

export interface StoryRecord {
  id: number;
  rank: number;
  type: string;
  title: string;
  titleZh: string;
  url: string;
  domain: string;
  hnUrl: string;
  author: string;
  score: number;
  publishedAt: string;
  commentsCount: number;
  textRawHtml: string;
  textZhHtml: string;
  summaryRaw: string[];
  summaryZh: string[];
  translationStatus: TranslationStatus;
  contentHash: string;
  comments: CommentNode[];
}

export interface BatchPushRecord {
  status: PushStatus;
  sentAt?: string;
  messageUrl?: string;
  error?: string;
}

export interface BatchManifestStory {
  id: number;
  rank: number;
  title: string;
  titleZh: string;
  storyUrl: string;
  hnUrl: string;
  sourceUrl: string;
  commentsCount: number;
  translationStatus: TranslationStatus;
}

export interface BatchManifest {
  batchId: string;
  timezone: string;
  slot: RunSlot;
  generatedAt: string;
  storyCount: number;
  latestIndexUrl: string;
  batchUrl: string;
  stories: BatchManifestStory[];
  push: BatchPushRecord;
}

export interface TranslationCacheEntry {
  key: string;
  translated: string;
  updatedAt: string;
  sourceHash: string;
  provider: string;
}

export interface TranslationCacheState {
  version: number;
  entries: Record<string, TranslationCacheEntry>;
}

export interface PushHistoryEntry {
  batchId: string;
  sentAt?: string;
  status: PushStatus;
  messageUrl?: string;
  error?: string;
}

export interface PushHistoryState {
  version: number;
  entries: PushHistoryEntry[];
}

export interface BatchHistoryEntry {
  batchId: string;
  slot: RunSlot;
  generatedAt: string;
  batchUrl: string;
  storyCount: number;
}

export interface BatchHistoryState {
  version: number;
  latestBatchId: string | null;
  entries: BatchHistoryEntry[];
}

export interface StateBundle {
  translationCache: TranslationCacheState;
  pushHistory: PushHistoryState;
  batches: BatchHistoryState;
}

export interface ProjectPaths {
  rootDir: string;
  stateDir: string;
  distDir: string;
}
