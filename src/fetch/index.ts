import type { AppEnv, RunConfig, StoryRecord } from "../shared/types.js";
import { buildStoryRecord, fetchBestStoryIds } from "./hn.js";

export async function fetchStories(config: RunConfig, _env: AppEnv): Promise<StoryRecord[]> {
  const storyIds = await fetchBestStoryIds(config.listUrl, config.limit);
  const stories = await Promise.all(
    storyIds.map((storyId, index) => buildStoryRecord(storyId, index + 1, config.articleSummaryMaxParagraphs))
  );
  return stories.filter((entry): entry is StoryRecord => Boolean(entry));
}
