import { restoreText, protectText } from "../protect.js";

export interface ProviderResult {
  text: string;
  provider: "openai" | "google";
}

function normalizeOpenAiBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function translateWithOpenAi(
  text: string,
  options: { apiKey: string; baseUrl: string; model: string }
): Promise<string> {
  if (!options.apiKey) {
    throw new Error("OPENAI_API_KEY is empty");
  }

  const url = `${normalizeOpenAiBaseUrl(options.baseUrl)}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify({
      model: options.model || "gpt-5.3",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Translate user text into Simplified Chinese. Keep placeholders like __PH_0__ unchanged. Do not add explanations."
        },
        {
          role: "user",
          content: text
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI translate failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const stitched = content
      .map((entry) => entry?.text ?? "")
      .join("")
      .trim();
    if (stitched) {
      return stitched;
    }
  }

  throw new Error("OpenAI translate returned empty content");
}

async function translateWithGoogle(text: string): Promise<string> {
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client", "gtx");
  endpoint.searchParams.set("sl", "auto");
  endpoint.searchParams.set("tl", "zh-CN");
  endpoint.searchParams.set("dt", "t");
  endpoint.searchParams.set("q", text);

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Google translate failed: ${response.status}`);
  }

  const payload = (await response.json()) as unknown[];
  const chunks = (payload?.[0] as unknown[]) || [];
  const translated = chunks
    .map((row) => ((row as unknown[])[0] ?? "").toString())
    .join("")
    .trim();
  return translated || text;
}

export async function translateTextWithFallback(
  raw: string,
  options: { apiKey: string; baseUrl: string; model: string }
): Promise<ProviderResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: raw, provider: "google" };
  }

  const { text: protectedText, placeholders } = protectText(raw);

  try {
    const openAiResult = await translateWithOpenAi(protectedText, options);
    return {
      text: restoreText(openAiResult, placeholders),
      provider: "openai"
    };
  } catch {
    const googleResult = await translateWithGoogle(protectedText);
    return {
      text: restoreText(googleResult, placeholders),
      provider: "google"
    };
  }
}
