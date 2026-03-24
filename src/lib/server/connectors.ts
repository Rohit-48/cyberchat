/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

const CONNECTOR_SPECS = {
  anthropic: {
    requiresKey: true,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
  },
  openai: {
    requiresKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
  },
  gemini: {
    requiresKey: true,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    envKey: "GEMINI_API_KEY",
  },
  ollama: {
    requiresKey: false,
    defaultBaseUrl: "http://127.0.0.1:11434",
    envKey: "",
  },
};

function getConnectorSpec(provider) {
  return CONNECTOR_SPECS[provider] || CONNECTOR_SPECS.anthropic;
}

function trimTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}

function getAttachmentFallbackNotes(attachments = []) {
  return attachments
    .filter((attachment) => attachment.kind === "pdf")
    .map((attachment) => `[PDF attachment: ${attachment.name}]`);
}

function buildAnthropicMessages(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      if (message.role === "assistant") {
        return {
          role: "assistant",
          content: message.content,
        };
      }

      const attachments = message.attachments || [];
      if (!attachments.length) {
        return {
          role: "user",
          content: message.content,
        };
      }

      const contentBlocks = [];
      if ((message.content || "").trim()) {
        contentBlocks.push({
          type: "text",
          text: message.content,
        });
      }

      const missingAttachmentNotes = [];

      attachments.forEach((attachment) => {
        if (attachment.kind === "image") {
          if (attachment.base64Data) {
            contentBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: attachment.mimeType,
                data: attachment.base64Data,
              },
            });
          } else {
            missingAttachmentNotes.push(
              `[Image attachment unavailable after reload: ${attachment.name}]`,
            );
          }
        }

        if (attachment.kind === "pdf") {
          if (attachment.base64Data) {
            contentBlocks.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: attachment.base64Data,
              },
            });
          } else {
            missingAttachmentNotes.push(
              `[PDF attachment unavailable after reload: ${attachment.name}]`,
            );
          }
        }
      });

      if (missingAttachmentNotes.length) {
        contentBlocks.push({
          type: "text",
          text: missingAttachmentNotes.join("\n"),
        });
      }

      return {
        role: "user",
        content: contentBlocks.length
          ? contentBlocks
          : [{ type: "text", text: "[Attachment payload unavailable]" }],
      };
    });
}

function buildOpenAIMessages(messages, systemPrompt) {
  return [
    { role: "system", content: systemPrompt },
    ...messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => {
        if (message.role === "assistant") {
          return {
            role: "assistant",
            content: message.content,
          };
        }

        const content = [];
        const fallbackNotes = getAttachmentFallbackNotes(message.attachments || []);

        if ((message.content || "").trim()) {
          content.push({ type: "text", text: message.content });
        }

        (message.attachments || []).forEach((attachment) => {
          if (attachment.kind === "image" && attachment.base64Data) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.base64Data}`,
              },
            });
          }
        });

        if (fallbackNotes.length) {
          content.push({ type: "text", text: fallbackNotes.join("\n") });
        }

        if (content.length === 1 && content[0].type === "text") {
          return {
            role: "user",
            content: content[0].text,
          };
        }

        return {
          role: "user",
          content: content.length ? content : message.content || "[ empty ]",
        };
      }),
  ];
}

function buildGeminiContents(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const parts = [];

      if ((message.content || "").trim()) {
        parts.push({ text: message.content });
      }

      (message.attachments || []).forEach((attachment) => {
        if ((attachment.kind === "image" || attachment.kind === "pdf") && attachment.base64Data) {
          parts.push({
            inline_data: {
              mime_type:
                attachment.kind === "pdf" ? "application/pdf" : attachment.mimeType,
              data: attachment.base64Data,
            },
          });
        }
      });

      if (!parts.length) {
        parts.push({ text: "[ empty ]" });
      }

      return {
        role: message.role === "assistant" ? "model" : "user",
        parts,
      };
    });
}

function buildOllamaMessages(messages, systemPrompt) {
  const normalized = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .forEach((message) => {
      if (message.role === "assistant") {
        normalized.push({
          role: "assistant",
          content: message.content,
        });
        return;
      }

      const images = [];
      const fallbackNotes = getAttachmentFallbackNotes(message.attachments || []);

      (message.attachments || []).forEach((attachment) => {
        if (attachment.kind === "image" && attachment.base64Data) {
          images.push(attachment.base64Data);
        }
      });

      normalized.push({
        role: "user",
        content:
          [message.content, ...fallbackNotes].filter(Boolean).join("\n\n") || "[ empty ]",
        images,
      });
    });

  return normalized;
}

async function parseJsonSafely(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { message: text };
}

function parseConnectorError(data, status) {
  if (typeof data?.error === "string") {
    return data.error;
  }

  if (typeof data?.error?.message === "string") {
    return data.error.message;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (typeof data?.error?.details === "string") {
    return data.error.details;
  }

  return `HTTP ${status}`;
}

function parseOpenAIText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text || "")
      .join("\n\n")
      .trim();
  }

  return "";
}

function parseGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n\n")
      .trim() || ""
  );
}

function resolveProviderKey(provider, payloadKey = "") {
  const spec = getConnectorSpec(provider);

  return payloadKey?.trim() || process.env[spec.envKey] || "";
}

function resolveBaseUrl(provider, payloadBaseUrl = "") {
  const spec = getConnectorSpec(provider);

  return trimTrailingSlash(payloadBaseUrl || process.env[`${provider.toUpperCase()}_BASE_URL`] || spec.defaultBaseUrl);
}

export async function requestChatCompletion({
  apiKey,
  baseUrl,
  config,
  messages,
  signal,
}) {
  const provider = config.provider;
  const resolvedKey = resolveProviderKey(provider, apiKey);
  const rootUrl = resolveBaseUrl(provider, baseUrl);

  if (getConnectorSpec(provider).requiresKey && !resolvedKey) {
    throw new Error(`${provider.toUpperCase()} API key missing`);
  }

  if (provider === "anthropic") {
    const response = await fetch(`${rootUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": resolvedKey,
        "anthropic-version": "2023-06-01",
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        temperature: Number(config.temperature) || 0,
        max_tokens: Number(config.maxTokens) || 1024,
        system: config.systemPrompt,
        messages: buildAnthropicMessages(messages),
      }),
    });
    const data = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(parseConnectorError(data, response.status));
    }

    return (
      data?.content
        ?.filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n\n")
        .trim() || "[ empty response ]"
    );
  }

  if (provider === "openai") {
    const response = await fetch(`${rootUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedKey}`,
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        temperature: Number(config.temperature) || 0,
        max_tokens: Number(config.maxTokens) || 1024,
        messages: buildOpenAIMessages(messages, config.systemPrompt),
      }),
    });
    const data = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(parseConnectorError(data, response.status));
    }

    return parseOpenAIText(data) || "[ empty response ]";
  }

  if (provider === "gemini") {
    const response = await fetch(
      `${rootUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(resolvedKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: config.systemPrompt }],
          },
          contents: buildGeminiContents(messages),
          generationConfig: {
            temperature: Number(config.temperature) || 0,
            maxOutputTokens: Number(config.maxTokens) || 1024,
          },
        }),
      },
    );
    const data = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(parseConnectorError(data, response.status));
    }

    return parseGeminiText(data) || "[ empty response ]";
  }

  const response = await fetch(`${rootUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: config.model,
      stream: false,
      options: {
        temperature: Number(config.temperature) || 0,
        num_predict: Number(config.maxTokens) || 1024,
      },
      messages: buildOllamaMessages(messages, config.systemPrompt),
    }),
  });
  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(parseConnectorError(data, response.status));
  }

  return data?.message?.content?.trim() || data?.response?.trim() || "[ empty response ]";
}

export async function requestTtsStream(payload, signal) {
  const elevenLabsKey =
    payload.elevenLabsKey?.trim() || process.env.ELEVENLABS_API_KEY || "";
  const voiceId = payload.voiceId?.trim() || process.env.ELEVENLABS_VOICE_ID || "";

  if (!payload.text?.trim()) {
    return Response.json({ error: "TTS text missing" }, { status: 400 });
  }

  if (!elevenLabsKey || !voiceId) {
    return Response.json({ error: "ELEVENLABS CONFIG MISSING" }, { status: 400 });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        text: payload.text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.45,
          style: 0.15,
          use_speaker_boost: false,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorData = await parseJsonSafely(response);
    return Response.json(
      { error: parseConnectorError(errorData, response.status) },
      { status: response.status },
    );
  }

  const audioBuffer = await response.arrayBuffer();

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
