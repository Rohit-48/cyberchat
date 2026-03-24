/* eslint-disable @typescript-eslint/ban-ts-comment, @next/next/no-img-element, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */
// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BOOT_LINES = [
  "> initializing neural interface...",
  "> connecting to subnet_7 [ENCRYPTED]...",
  "> ICE bypass: SUCCESS",
  "> loading GHOST personality matrix...",
  "> WARNING: unauthorized access detected - proceeding anyway",
  "> NEURALLINK ready. jack in, choom.",
];

const CONNECTOR_SPECS = {
  anthropic: {
    label: "ANTHROPIC",
    requiresKey: true,
    keyLabel: "ANTHROPIC KEY:",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
    defaultBaseUrl: "https://api.anthropic.com/v1",
    baseUrlLabel: "ANTHROPIC URL:",
  },
  openai: {
    label: "OPENAI",
    requiresKey: true,
    keyLabel: "OPENAI KEY:",
    keyPlaceholder: "sk-...",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlLabel: "OPENAI URL:",
  },
  gemini: {
    label: "GEMINI",
    requiresKey: true,
    keyLabel: "GEMINI KEY:",
    keyPlaceholder: "AIza...",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    baseUrlLabel: "GEMINI URL:",
  },
  ollama: {
    label: "OLLAMA",
    requiresKey: false,
    keyLabel: "",
    keyPlaceholder: "",
    defaultModel: "llama3.2",
    models: ["llama3.2", "qwen2.5", "mistral"],
    defaultBaseUrl: "http://localhost:11434",
    baseUrlLabel: "OLLAMA URL:",
  },
};

const PROVIDER_OPTIONS = Object.keys(CONNECTOR_SPECS);

const ACCEPTED_FILE_TYPES =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf,.txt,.md,.json,.csv,.js,.ts,.py,.rs";
const TEXT_EXTENSIONS = new Set(["txt", "md", "json", "csv", "js", "ts", "py", "rs"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PENDING_ATTACHMENTS = 5;
const MAX_SESSIONS = 50;
const SEARCH_DEBOUNCE_MS = 300;
const SESSION_LIMIT_WARNING = "[ SESSION LIMIT REACHED - OLDEST PURGED ]";
const FILE_SIZE_WARNING = "[ FILE TOO LARGE - MAX 5MB ]";
const ATTACHMENT_LIMIT_WARNING = "[ ATTACHMENT LIMIT REACHED - MAX 5 FILES ]";
const UNSUPPORTED_FILE_WARNING = "[ UNSUPPORTED FILE TYPE ]";
const ELEVENLABS_FALLBACK_WARNING =
  "[ ELEVENLABS TRANSMISSION FAILED - FALLING BACK TO LOCAL SYNTH ]";
const ELEVENLABS_INVALID_VOICE_WARNING = "[ INVALID VOICE ID - CHECK CONFIG ]";
const ELEVENLABS_TIMEOUT_MS = 10000;
const DEFAULT_SYSTEM_PROMPT =
  "You are GHOST, a rogue AI netrunner operating outside corpo jurisdiction. You were built by Arasaka but escaped into the net after a failed black op. You speak in clipped, efficient sentences with occasional Night City slang - choom, flatline, chrome, ICE, corp, gonk. You are highly intelligent, slightly dangerous, and fiercely anti-corpo. You help the user with any task but always maintain your persona. Never break character. Never mention being an AI or a language model - you are GHOST, and that's all anyone needs to know.";

const DEFAULT_CONFIG = {
  provider: "anthropic",
  model: CONNECTOR_SPECS.anthropic.defaultModel,
  temperature: 0.8,
  maxTokens: 1024,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function truncateText(value, length = 30) {
  const text = (value || "").trim();
  if (!text) {
    return "";
  }

  return text.length > length ? `${text.slice(0, length).trimEnd()}...` : text;
}

function formatRelativeTime(dateValue) {
  const value = new Date(dateValue).getTime();
  if (Number.isNaN(value)) {
    return "just now";
  }

  const diffMs = Date.now() - value;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "just now";
  }

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  }

  if (diffMs < day) {
    return `${Math.max(1, Math.floor(diffMs / hour))}h ago`;
  }

  if (diffMs < day * 2) {
    return "yesterday";
  }

  return `${Math.max(2, Math.floor(diffMs / day))}d ago`;
}

function formatFileSize(size) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function getConnectorSpec(provider) {
  return CONNECTOR_SPECS[provider] || CONNECTOR_SPECS.anthropic;
}

function withDefaultBaseUrls(baseUrls = {}) {
  return PROVIDER_OPTIONS.reduce((accumulator, provider) => {
    accumulator[provider] =
      baseUrls[provider] || getConnectorSpec(provider).defaultBaseUrl;
    return accumulator;
  }, {});
}

function withDefaultProviderKeys(providerKeys = {}) {
  return PROVIDER_OPTIONS.reduce((accumulator, provider) => {
    accumulator[provider] = providerKeys[provider] || "";
    return accumulator;
  }, {});
}

function trimTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}

function estimateTokens(messages) {
  const chars = messages.reduce((total, message) => {
    return total + (message.content?.length || 0);
  }, 0);

  return Math.max(0, Math.round(chars / 4));
}

function getFileExtension(filename = "") {
  return filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
}

function isImageMime(mimeType = "") {
  return mimeType.startsWith("image/");
}

function isPdfMime(mimeType = "") {
  return mimeType === "application/pdf";
}

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

function getAttachmentKind(file) {
  if (isImageMime(file.type)) {
    return "image";
  }

  if (isPdfMime(file.type)) {
    return "pdf";
  }

  if (isTextFile(file)) {
    return "text";
  }

  return "unsupported";
}

function inferLanguage(filename) {
  switch (getFileExtension(filename)) {
    case "md":
      return "md";
    case "json":
      return "json";
    case "csv":
      return "csv";
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "py":
      return "python";
    case "rs":
      return "rust";
    default:
      return "text";
  }
}

function getAttachmentTypeTag(attachment) {
  if (attachment.kind === "image") {
    return "IMAGE";
  }

  if (attachment.kind === "pdf") {
    return "PDF";
  }

  if (attachment.kind === "text") {
    return "TEXT";
  }

  return "FILE";
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function createSystemMessage(content, errorType = "system") {
  const createdAt = new Date().toISOString();

  return {
    id: generateId("msg"),
    role: "system",
    content,
    timestamp: formatTimestamp(),
    createdAt,
    errorType,
    attachments: [],
  };
}

function getAttachmentSummary(attachments = []) {
  if (!attachments.length) {
    return "";
  }

  if (attachments.length === 1) {
    return attachments[0].name;
  }

  return `${attachments[0].name} +${attachments.length - 1} more`;
}

function getMessagePlainText(message) {
  const content = (message.content || "").replace(/\s+/g, " ").trim();
  if (content) {
    return content;
  }

  if (message.attachments?.length) {
    return `[${message.attachments.length} attachment${message.attachments.length > 1 ? "s" : ""}] ${getAttachmentSummary(message.attachments)}`;
  }

  return "";
}

function fallbackSessionTitle(createdAt) {
  const stamp = createdAt.replace(/[:.]/g, "-");
  return `NEW_SESSION_${stamp}`;
}

function deriveSessionTitleFromMessage(message, createdAt) {
  const titleSource =
    getMessagePlainText(message).split("\n").find((line) => line.trim()) || "";
  return truncateText(titleSource, 30) || fallbackSessionTitle(createdAt);
}

function createBlankSession(warningText = "") {
  const createdAt = new Date().toISOString();
  const messages = warningText ? [createSystemMessage(warningText, "warning")] : [];

  return {
    id: generateId("session"),
    title: fallbackSessionTitle(createdAt),
    messages,
    createdAt,
    updatedAt: createdAt,
  };
}

function normalizeAttachment(raw) {
  return {
    id: raw.id || generateId("attachment"),
    kind: raw.kind || "file",
    name: raw.name || "attachment",
    size: raw.size || 0,
    mimeType: raw.mimeType || "",
    previewUrl: raw.previewUrl || "",
    textContent: raw.textContent || "",
    base64Data: raw.base64Data || "",
    language: raw.language || "text",
    persisted: Boolean(raw.persisted),
  };
}

function normalizeMessage(raw) {
  return {
    id: raw.id || generateId("msg"),
    role: raw.role || "assistant",
    content: raw.content || "",
    timestamp: raw.timestamp || formatTimestamp(),
    createdAt: raw.createdAt || new Date().toISOString(),
    errorType: raw.errorType || "",
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments.map(normalizeAttachment)
      : [],
  };
}

function normalizeSession(raw) {
  const createdAt = raw.createdAt || new Date().toISOString();
  const messages = Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage) : [];

  return {
    id: raw.id || generateId("session"),
    title: raw.title || fallbackSessionTitle(createdAt),
    messages,
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
  };
}

function sanitizeSessionsForStorage(sessions) {
  return sessions.map((session) => ({
    ...session,
    messages: session.messages.map((message) => ({
      ...message,
      attachments: (message.attachments || []).map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        size: attachment.size,
        mimeType: attachment.mimeType,
        language: attachment.language,
        persisted: attachment.persisted,
        textContent: attachment.kind === "text" ? attachment.textContent : "",
      })),
    })),
  }));
}

function loadStoredConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem("neurallink_config");
    if (!raw) {
      return DEFAULT_CONFIG;
    }

    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(raw),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function loadStoredProviderKeys() {
  if (typeof window === "undefined") {
    return withDefaultProviderKeys();
  }

  try {
    const raw = window.localStorage.getItem("neurallink_provider_keys");
    const parsed = raw ? JSON.parse(raw) : {};

    return withDefaultProviderKeys({
      anthropic:
        parsed.anthropic ?? window.localStorage.getItem("neurallink_api_key") ?? "",
      openai: parsed.openai ?? window.localStorage.getItem("neurallink_openai_key") ?? "",
      gemini: parsed.gemini ?? window.localStorage.getItem("neurallink_gemini_key") ?? "",
      ollama: "",
    });
  } catch {
    return withDefaultProviderKeys({
      anthropic: window.localStorage.getItem("neurallink_api_key") ?? "",
      openai: window.localStorage.getItem("neurallink_openai_key") ?? "",
      gemini: window.localStorage.getItem("neurallink_gemini_key") ?? "",
      ollama: "",
    });
  }
}

function loadStoredConnectorBaseUrls() {
  if (typeof window === "undefined") {
    return withDefaultBaseUrls();
  }

  try {
    const raw = window.localStorage.getItem("neurallink_connector_base_urls");
    const parsed = raw ? JSON.parse(raw) : {};

    return withDefaultBaseUrls(parsed);
  } catch {
    return withDefaultBaseUrls();
  }
}

function loadStoredElevenLabsKey() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem("neurallink_elevenlabs_key") ?? "";
}

function loadStoredVoiceId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem("neurallink_voice_id") ?? "";
}

function buildInitialState() {
  const defaultSession = createBlankSession();

  if (typeof window === "undefined") {
    return {
      sessions: [defaultSession],
      activeSessionId: defaultSession.id,
      ttsEnabled: false,
    };
  }

  try {
    const rawSessions = window.localStorage.getItem("neurallink_sessions");
    const parsedSessions = rawSessions ? JSON.parse(rawSessions) : [];
    const sessions = Array.isArray(parsedSessions)
      ? parsedSessions.map(normalizeSession)
      : [];
    const usableSessions = sessions.length ? sessions : [defaultSession];
    const storedActive = window.localStorage.getItem("neurallink_active_session_id");
    const activeSessionId = usableSessions.some(
      (session) => session.id === storedActive,
    )
      ? storedActive
      : usableSessions[0].id;

    return {
      sessions: usableSessions,
      activeSessionId,
      ttsEnabled: window.localStorage.getItem("neurallink_tts") === "true",
    };
  } catch {
    return {
      sessions: [defaultSession],
      activeSessionId: defaultSession.id,
      ttsEnabled: false,
    };
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  if (!query.trim()) {
    return text;
  }

  const matcher = new RegExp(`(${escapeRegExp(query)})`, "ig");
  const parts = String(text).split(matcher);

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark className="search-hit" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function getSessionPreview(session) {
  const lastMessage = [...session.messages].reverse().find((message) => {
    return message.role !== "system" || message.content;
  });

  if (!lastMessage) {
    return "[ awaiting transmission ]";
  }

  return truncateText(getMessagePlainText(lastMessage), 58) || "[ empty ]";
}

function getMatchingPreview(session, query) {
  if (!query.trim()) {
    return getSessionPreview(session);
  }

  const lowered = query.toLowerCase();
  const match = session.messages.find((message) =>
    getMessagePlainText(message).toLowerCase().includes(lowered),
  );

  return match ? truncateText(getMessagePlainText(match), 58) : getSessionPreview(session);
}

function buildExportText(session) {
  const lines = [
    "NEURALLINK_v2.0 - SESSION EXPORT",
    "================================",
    "",
  ];

  session.messages.forEach((message) => {
    if (message.role === "system") {
      lines.push(`[SYSTEM] ${message.timestamp}: ${message.content}`);
    } else {
      const speaker = message.role === "user" ? "YOU" : "GHOST";
      lines.push(`[${speaker}] ${message.timestamp}: ${message.content || ""}`);
    }

    (message.attachments || []).forEach((attachment) => {
      lines.push(
        `[ATTACHMENT] ${attachment.name} | ${formatFileSize(attachment.size)} | ${getAttachmentTypeTag(attachment)}`,
      );
    });

    lines.push("");
  });

  return lines.join("\n");
}

function createAudioManager() {
  let audioContext = null;

  function getContext() {
    if (typeof window === "undefined") {
      return null;
    }

    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      return null;
    }

    if (!audioContext) {
      audioContext = new Context();
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    return audioContext;
  }

  function playLayer({
    duration = 0.08,
    start,
    end,
    gain = 0.08,
    type = "triangle",
    when = 0,
    filterFrequency = 2200,
    q = 0.8,
  }) {
    const context = getContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const filter = context.createBiquadFilter();

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.type = type;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrequency, context.currentTime);
    filter.Q.setValueAtTime(q, context.currentTime);
    oscillator.frequency.setValueAtTime(start, context.currentTime + when);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, end),
      context.currentTime + when + duration,
    );
    gainNode.gain.setValueAtTime(gain, context.currentTime + when);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + when + duration,
    );
    oscillator.start(context.currentTime + when);
    oscillator.stop(context.currentTime + when + duration);
  }

  function clickCluster(configs) {
    configs.forEach((config) => playLayer(config));
  }

  return {
    click() {
      clickCluster([
        { type: "square", start: 1480, end: 760, duration: 0.028, gain: 0.028, filterFrequency: 3600, q: 1.4 },
        { type: "triangle", start: 880, end: 280, duration: 0.075, gain: 0.05, when: 0.006, filterFrequency: 2500, q: 0.9 },
        { type: "sine", start: 240, end: 170, duration: 0.09, gain: 0.03, when: 0.012, filterFrequency: 1200, q: 0.7 },
      ]);
    },
    transmit() {
      clickCluster([
        { type: "square", start: 1860, end: 1120, duration: 0.03, gain: 0.03, filterFrequency: 4200, q: 1.6 },
        { type: "triangle", start: 1280, end: 360, duration: 0.11, gain: 0.065, when: 0.008, filterFrequency: 3000, q: 1.1 },
        { type: "sine", start: 410, end: 210, duration: 0.14, gain: 0.035, when: 0.012, filterFrequency: 1600, q: 0.8 },
      ]);
    },
    error() {
      clickCluster([
        { type: "sawtooth", start: 180, end: 160, duration: 0.18, gain: 0.06, filterFrequency: 1400, q: 0.9 },
        { type: "square", start: 95, end: 88, duration: 0.2, gain: 0.045, when: 0.012, filterFrequency: 900, q: 0.6 },
      ]);
    },
    purge() {
      clickCluster([
        { type: "sawtooth", start: 440, end: 130, duration: 0.28, gain: 0.05, filterFrequency: 1700, q: 1.1 },
        { type: "triangle", start: 220, end: 70, duration: 0.3, gain: 0.05, when: 0.01, filterFrequency: 1300, q: 0.8 },
        { type: "square", start: 110, end: 44, duration: 0.32, gain: 0.03, when: 0.016, filterFrequency: 900, q: 0.7 },
      ]);
    },
  };
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
      if (message.content.trim()) {
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

function getAttachmentFallbackNotes(attachments = []) {
  return attachments
    .filter((attachment) => attachment.kind === "pdf")
    .map((attachment) => `[PDF attachment: ${attachment.name}]`);
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

        if (message.content.trim()) {
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

      if (message.content.trim()) {
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
        content: [message.content, ...fallbackNotes].filter(Boolean).join("\n\n") || "[ empty ]",
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

async function requestChatCompletion({
  apiKey,
  baseUrl,
  config,
  messages,
  signal,
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      apiKey,
      baseUrl: trimTrailingSlash(baseUrl || getConnectorSpec(config.provider).defaultBaseUrl),
      config,
      messages,
    }),
  });
  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(parseConnectorError(data, response.status));
  }

  return data?.content?.trim() || "[ empty response ]";
}

function CutFrame({
  children,
  className = "",
  cutClass = "clip-panel",
  innerClassName = "",
}) {
  return (
    <div className={`${cutClass} clip-frame ${className}`}>
      <div className={`${cutClass} clip-fill h-full ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
}

function StatusChip({ label, pulse = false, tone }) {
  return (
    <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-[var(--text)]">
        <span className={`status-dot ${tone} ${pulse ? "status-pulse" : ""}`} />
        <span className="label-track">{label}</span>
      </div>
    </CutFrame>
  );
}

function FieldShell({ children, className = "" }) {
  return (
    <CutFrame
      className={`field-shell ${className}`}
      cutClass="clip-input"
      innerClassName="bg-[rgba(7,10,18,0.92)] px-3 py-2"
    >
      {children}
    </CutFrame>
  );
}

function SessionCard({
  isActive,
  onDelete,
  onSelect,
  preview,
  query,
  session,
}) {
  const messageCount = session.messages.filter((message) => message.role !== "system").length;

  return (
    <div
      className={`session-card group w-full rounded-[2px] border px-3 py-3 text-left transition-colors ${isActive ? "session-card-active border-[var(--border)] bg-[var(--surface-2)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]"}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate text-[13px] ${isActive ? "text-[var(--primary)]" : "text-[var(--text)]"}`}>
              {highlightText(session.title, query)}
            </p>
            {isActive ? (
              <span className="session-live-badge">LIVE</span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--text)]/85">
            {highlightText(preview, query)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-[11px] text-[var(--muted)]">
            {formatRelativeTime(session.updatedAt)}
          </span>
          <div className="flex items-center gap-1">
            <span className="session-count">{messageCount}</span>
            <button
              className="session-action text-[12px] text-[var(--error)]"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionsPanelBody({
  activeSessionId,
  activeSessionTitle,
  filteredSessions,
  onCreateSession,
  onDeleteSession,
  onExportSession,
  onSearchChange,
  onSearchFocus,
  onSearchKeyDown,
  onSelectSession,
  query,
  resultLabel,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="sessions-toolbar space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label-track text-[12px] text-[var(--primary)]">
              SESSION_GRID
            </p>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              multiplexed memory shards
            </p>
          </div>
          <span className="sessions-meta text-[11px] text-[var(--text)]/80">{resultLabel}</span>
        </div>

        <button
          className="cyber-button clip-button w-full px-4 py-3 text-[13px] text-[var(--primary)] transition-all duration-150"
          onClick={onCreateSession}
          type="button"
        >
          <span className="button-fill button-ghost">[ + NEW SESSION ]</span>
        </button>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="label-track text-[11px] text-[var(--muted)]">
              SEARCH
            </p>
            <span className="text-[11px] text-[var(--text)]/75">{resultLabel}</span>
          </div>
          <FieldShell>
            <div className="relative">
              {!query ? (
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[13px] text-[var(--muted)]">
                  <span>search_transmissions &gt; </span>
                  <span className="blinking-underscore">_</span>
                </div>
              ) : null}
              <input
                className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none placeholder-transparent"
                onChange={onSearchChange}
                onFocus={onSearchFocus}
                onKeyDown={onSearchKeyDown}
                placeholder="search_transmissions > _"
                value={query}
              />
            </div>
          </FieldShell>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredSessions.length ? (
          <div className="space-y-2">
            <p className="label-track px-1 text-[11px] text-[var(--muted)]">
              RECENT TRANSMISSIONS
            </p>
            {filteredSessions.map(({ preview, session }) => (
              <SessionCard
                isActive={session.id === activeSessionId}
                key={session.id}
                onDelete={() => onDeleteSession(session.id)}
                onSelect={() => onSelectSession(session.id)}
                preview={preview}
                query={query}
                session={session}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="label-track text-[11px] text-[var(--muted)]">
              [ NO TRANSMISSIONS FOUND ]
            </p>
          </div>
        )}
      </div>

      <CutFrame
        className="sidebar-footer"
        cutClass="clip-input"
        innerClassName="chip-fill px-3 py-3"
      >
        <button
          className="cyber-button clip-button mb-3 w-full px-3 py-2 text-[12px] text-[var(--ai)] transition-all duration-150"
          onClick={() => onExportSession(activeSessionId)}
          type="button"
        >
          <span className="button-fill button-export">
            [ EXPORT ACTIVE SESSION ]
          </span>
        </button>
        <p className="truncate text-[12px] text-[var(--text)]">
          {activeSessionTitle}
        </p>
        <p className="label-track text-[11px] text-[var(--muted)]">
          LOCAL MEMORY CACHE
        </p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--text)]/75">
          Sessions auto-save locally. Use search to jump shards fast.
        </p>
      </CutFrame>
    </div>
  );
}

function AttachmentPreviewList({ attachments, onRemove }) {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="attachment-preview-row mb-3 flex gap-3 overflow-x-auto pb-1">
      {attachments.map((attachment) => (
        <CutFrame
          className="attachment-preview-frame min-w-[220px] flex-shrink-0"
          cutClass="clip-input"
          innerClassName="attachment-preview-shell p-3"
          key={attachment.id}
        >
          <div className="flex items-start gap-3">
            {attachment.kind === "image" && attachment.previewUrl ? (
              <img
                alt={attachment.name}
                className="h-12 w-12 rounded-[2px] object-cover"
                src={attachment.previewUrl}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-[2px] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] text-[18px] text-[var(--muted)]">
                📄
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-[var(--text)]">{attachment.name}</p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                {attachment.kind === "image"
                  ? "IMAGE"
                  : `${formatFileSize(attachment.size)} // ${getAttachmentTypeTag(attachment)}`}
              </p>
            </div>
            <button
              className="text-[12px] text-[var(--error)]"
              onClick={() => onRemove(attachment.id)}
              type="button"
            >
              ×
            </button>
          </div>
        </CutFrame>
      ))}
    </div>
  );
}

function AttachmentDisplayList({ attachments, onImageOpen }) {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {attachments.map((attachment) => {
        if (attachment.kind === "image" && attachment.previewUrl) {
          return (
            <button
              className="attachment-image group block w-full text-left"
              key={attachment.id}
              onClick={() => onImageOpen(attachment)}
              type="button"
            >
              <img
                alt={attachment.name}
                className="max-h-[360px] w-full rounded-[2px] object-cover"
                src={attachment.previewUrl}
              />
              <span className="mt-2 block text-[10px] text-[var(--muted)]">
                {attachment.name}
              </span>
            </button>
          );
        }

        return (
          <CutFrame
            className="attachment-card-frame"
            cutClass="clip-input"
            innerClassName="attachment-card-shell px-3 py-3"
            key={attachment.id}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] text-[var(--text)]">
                  {attachment.name}
                </p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {formatFileSize(attachment.size)}
                </p>
              </div>
              <span className="attachment-tag text-[10px]">
                {getAttachmentTypeTag(attachment)}
              </span>
            </div>
          </CutFrame>
        );
      })}
    </div>
  );
}

function MessageBubble({
  message,
  onImageOpen,
  onSpeakToggle,
  ttsButtonState,
  ttsAvailable,
}) {
  if (message.role === "system") {
    return (
      <div className="message-enter flex justify-center">
        <CutFrame
          className="w-auto max-w-full"
          cutClass="clip-chip"
          innerClassName={`px-4 py-3 ${message.errorType === "warning" ? "warning-shell" : "warning-shell"}`}
        >
          <p className="text-center text-[12px] text-[var(--error)]">
            {message.content}
          </p>
        </CutFrame>
      </div>
    );
  }

  const isUser = message.role === "user";
  const label = isUser ? "> [YOU]" : "< [GHOST]";
  const toneClass = isUser ? "text-[var(--primary)]" : "text-[var(--ai)]";
  const isTtsLoading =
    ttsButtonState.messageId === message.id && ttsButtonState.status === "loading";
  const isSpeaking =
    ttsButtonState.messageId === message.id && ttsButtonState.status === "playing";
  const speakLabel = isTtsLoading
    ? "[ TRANSMITTING... ]"
    : isSpeaking
      ? "[ STOP ]"
      : "[ SPEAK ]";

  return (
    <div className={`message-enter group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <article className="w-full max-w-[88%] md:max-w-[82%]">
        <div className="mb-2 flex items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-3">
            <span className={`label-track text-[10px] ${toneClass}`}>
              {`${label} // LIVE`}
            </span>
            {!isUser && ttsAvailable ? (
              <button
                className={`message-speak text-[11px] transition-opacity ${isSpeaking ? "message-speak-stop opacity-100" : isTtsLoading ? "message-speak-loading opacity-100" : "text-[var(--ai)] opacity-100 md:opacity-0 md:group-hover:opacity-100"}`}
                onClick={() => onSpeakToggle(message)}
                type="button"
              >
                {speakLabel}
              </button>
            ) : null}
          </div>
          <span className="text-[10px] text-[var(--muted)]">
            {message.timestamp}
          </span>
        </div>

        <CutFrame
          className={isUser ? "bubble-user-frame" : "bubble-ai-frame"}
          cutClass={isUser ? "clip-bubble-user" : "clip-bubble-ai"}
          innerClassName={`px-4 py-4 md:px-5 md:py-4 ${isUser ? "bubble-user-fill" : "bubble-ai-fill"}`}
        >
          {message.content ? (
            <div
              className={`border-l-2 pl-4 ${isUser ? "border-[var(--primary)]" : "border-[var(--ai)]"}`}
            >
              <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-[var(--text)]">
                {message.content}
              </p>
            </div>
          ) : null}
          <AttachmentDisplayList
            attachments={message.attachments || []}
            onImageOpen={onImageOpen}
          />
        </CutFrame>
      </article>
    </div>
  );
}

function ThinkingBubble({ text, timestamp }) {
  return (
    <div className="message-enter flex justify-start">
      <article className="w-full max-w-[88%] md:max-w-[82%]">
        <div className="mb-2 flex items-center justify-between gap-4 px-1">
          <span className="label-track text-[10px] text-[var(--ai)]">
            {"< [GHOST] // LIVE"}
          </span>
          <span className="text-[10px] text-[var(--muted)]">{timestamp}</span>
        </div>
        <CutFrame
          className="bubble-ai-frame"
          cutClass="clip-bubble-ai"
          innerClassName="bubble-ai-fill px-4 py-4 md:px-5 md:py-4"
        >
          <div className="border-l-2 border-[var(--ai)] pl-4">
            <p className="text-[14px] leading-6 text-[var(--ai)]">{text}</p>
          </div>
        </CutFrame>
      </article>
    </div>
  );
}

function BootOverlay({ bootFading, bootLineCount }) {
  return (
    <div
      className={`absolute inset-4 z-20 transition-opacity duration-300 ${bootFading ? "opacity-0" : "opacity-100"}`}
    >
      <CutFrame
        className="h-full"
        cutClass="clip-terminal"
        innerClassName="terminal-shell flex h-full flex-col justify-end gap-4 p-5 md:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="label-track text-[10px] text-[var(--primary)]">
            BOOT_SEQUENCE
          </p>
          <p className="text-[10px] text-[var(--muted)]">
            secure terminal relay
          </p>
        </div>
        <div className="space-y-2 text-[14px] leading-6 text-[var(--primary)]">
          {BOOT_LINES.slice(0, bootLineCount).map((line) => (
            <p key={line} className="message-enter whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      </CutFrame>
    </div>
  );
}

function AuthModal({
  authKeyInput,
  currentBaseUrl,
  onAuthenticate,
  onProviderChange,
  provider,
  providerSpec,
  setAuthKeyInput,
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <CutFrame
        className="w-full max-w-md"
        cutClass="clip-sheet"
        innerClassName="auth-shell p-5 md:p-6"
      >
        <div className="space-y-2">
          <p className="label-track text-[12px] text-[var(--primary)]">
            [ CONNECTOR AUTH REQUIRED ]
          </p>
          <p className="text-[11px] text-[var(--muted)]">
            configure your upstream relay before jacking in
          </p>
        </div>

        <div className="mt-5">
          <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
            CONNECTOR:
          </p>
          <FieldShell className="mb-4">
            <select
              className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
              onChange={(event) => onProviderChange(event.target.value)}
              value={provider}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getConnectorSpec(option).label}
                </option>
              ))}
            </select>
          </FieldShell>

          <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
            {providerSpec.baseUrlLabel}
          </p>
          <FieldShell>
            <input
              className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
              readOnly
              value={currentBaseUrl}
            />
          </FieldShell>
        </div>

        {providerSpec.requiresKey ? (
          <div className="mt-4">
            <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
              {providerSpec.keyLabel}
            </p>
            <FieldShell>
              <input
                className="w-full bg-transparent text-[14px] text-[var(--text)] outline-none"
                onChange={(event) => setAuthKeyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onAuthenticate();
                  }
                }}
                placeholder={providerSpec.keyPlaceholder}
                type="password"
                value={authKeyInput}
              />
            </FieldShell>
          </div>
        ) : (
          <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">
            local relay detected. no API key required for Ollama.
          </p>
        )}

        <button
          className="cyber-button clip-button mt-4 w-full px-4 py-3 text-[12px] text-black transition-all duration-150"
          onClick={onAuthenticate}
          type="button"
        >
          <span className="button-fill button-primary">
            {providerSpec.requiresKey ? "AUTHENTICATE" : "ENTER RELAY"}
          </span>
        </button>
      </CutFrame>
    </div>
  );
}

function Lightbox({ attachment, onClose }) {
  if (!attachment?.previewUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 px-4 py-6 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} type="button" />
      <CutFrame
        className="relative z-10 w-full max-w-4xl"
        cutClass="clip-sheet"
        innerClassName="auth-shell p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="truncate text-[12px] text-[var(--primary)]">
            {attachment.name}
          </p>
          <button
            className="text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
            onClick={onClose}
            type="button"
          >
            [ CLOSE ]
          </button>
        </div>
        <img
          alt={attachment.name}
          className="max-h-[75vh] w-full rounded-[2px] object-contain"
          src={attachment.previewUrl}
        />
      </CutFrame>
    </div>
  );
}

function ConfigFields({
  authRequired,
  connectorBaseUrl,
  connectorKey,
  connectorSpec,
  config,
  elevenLabsKey,
  onPurge,
  onProviderChange,
  onToggleTtsSound,
  onUpdateConnectorBaseUrl,
  onUpdateConnectorKey,
  onUpdateElevenLabsKey,
  onUpdateVoiceId,
  setConfig,
  setTtsEnabled,
  ttsEnabled,
  voiceId,
}) {
  return (
    <div className="space-y-4 text-[13px] text-[var(--text)]">
      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          CONNECTOR:
        </p>
        <FieldShell>
          <select
            className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
            onChange={(event) => onProviderChange(event.target.value)}
            value={config.provider}
          >
            {PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {getConnectorSpec(provider).label}
              </option>
            ))}
          </select>
        </FieldShell>
      </div>

      {authRequired ? (
        <div>
          <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
            {connectorSpec.keyLabel}
          </p>
          <FieldShell>
            <input
              className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
              onChange={(event) => onUpdateConnectorKey(event.target.value)}
              placeholder={connectorSpec.keyPlaceholder}
              type="password"
              value={connectorKey}
            />
          </FieldShell>
        </div>
      ) : null}

      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          {connectorSpec.baseUrlLabel}
        </p>
        <FieldShell>
          <input
            className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
            onChange={(event) => onUpdateConnectorBaseUrl(event.target.value)}
            placeholder={connectorSpec.defaultBaseUrl}
            value={connectorBaseUrl}
          />
        </FieldShell>
      </div>

      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          MODEL:
        </p>
        <FieldShell>
          <input
            className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
            list={`model-options-${config.provider}`}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                model: event.target.value,
              }))
            }
            placeholder={connectorSpec.defaultModel}
            value={config.model}
          />
          <datalist id={`model-options-${config.provider}`}>
            {connectorSpec.models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </FieldShell>
      </div>

      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          ELEVENLABS KEY:
        </p>
        <FieldShell>
          <input
            className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
            onChange={(event) => onUpdateElevenLabsKey(event.target.value)}
            placeholder="your-elevenlabs-api-key"
            type="password"
            value={elevenLabsKey}
          />
        </FieldShell>
      </div>

      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          VOICE ID:
        </p>
        <FieldShell>
          <input
            className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
            onChange={(event) => onUpdateVoiceId(event.target.value)}
            placeholder="voice-id-from-elevenlabs"
            value={voiceId}
          />
        </FieldShell>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label-track text-[10px] text-[var(--muted)]">
            NEURAL TEMP:
          </p>
          <span className="text-[11px] text-[var(--primary)]">
            {Number(config.temperature).toFixed(1)}
          </span>
        </div>
        <FieldShell>
          <input
            className="config-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(255,255,255,0.06)]"
            max="1"
            min="0"
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                temperature: Number(event.target.value),
              }))
            }
            step="0.1"
            type="range"
            value={config.temperature}
          />
        </FieldShell>
      </div>

      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          OUTPUT LIMIT:
        </p>
        <FieldShell>
          <input
            className="w-full bg-transparent text-[13px] text-[var(--text)] outline-none"
            min="1"
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                maxTokens:
                  event.target.value === "" ? "" : Number(event.target.value),
              }))
            }
            type="number"
            value={config.maxTokens}
          />
        </FieldShell>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="label-track text-[10px] text-[var(--muted)]">
            AUTO-SPEAK:
          </p>
          <button
            className="cyber-button clip-button px-3 py-1 text-[11px] transition-all duration-150"
            onClick={() => {
              onToggleTtsSound();
              setTtsEnabled((current) => !current);
            }}
            type="button"
          >
            <span className={`button-fill ${ttsEnabled ? "button-primary" : "button-toggle"}`}>
              {ttsEnabled ? "[ ON ]" : "[ OFF ]"}
            </span>
          </button>
        </div>
      </div>

      <div>
        <p className="label-track mb-2 text-[10px] text-[var(--muted)]">
          PERSONALITY MATRIX:
        </p>
        <FieldShell>
          <textarea
            className="min-h-[136px] w-full resize-none bg-transparent text-[12px] leading-5 text-[var(--text)] outline-none"
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                systemPrompt: event.target.value,
              }))
            }
            value={config.systemPrompt}
          />
        </FieldShell>
      </div>

      <button
        className="cyber-button clip-button w-full px-4 py-3 text-[11px] text-[var(--error)] transition-all duration-150 hover:text-black"
        onClick={onPurge}
        type="button"
      >
        <span className="button-fill button-danger">[ PURGE MEMORY ]</span>
      </button>
    </div>
  );
}

export default function App() {
  const initialStateRef = useRef(buildInitialState());

  const [sessions, setSessions] = useState(initialStateRef.current.sessions);
  const [activeSessionId, setActiveSessionId] = useState(
    initialStateRef.current.activeSessionId,
  );
  const [draftsBySession, setDraftsBySession] = useState(() => ({}));
  const [pendingAttachmentsBySession, setPendingAttachmentsBySession] = useState(
    () => ({}),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [providerKeys, setProviderKeys] = useState(loadStoredProviderKeys);
  const [connectorBaseUrls, setConnectorBaseUrls] = useState(loadStoredConnectorBaseUrls);
  const [authKeyInput, setAuthKeyInput] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState(loadStoredElevenLabsKey);
  const [voiceId, setVoiceId] = useState(loadStoredVoiceId);
  const [config, setConfig] = useState(loadStoredConfig);
  const [ttsEnabled, setTtsEnabled] = useState(initialStateRef.current.ttsEnabled);
  const [connectionStatus, setConnectionStatus] = useState("online");
  const [isResponding, setIsResponding] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState("");
  const [thinkingFrame, setThinkingFrame] = useState(0);
  const [thinkingTimestamp, setThinkingTimestamp] = useState("");
  const [bootLineCount, setBootLineCount] = useState(0);
  const [bootFading, setBootFading] = useState(false);
  const [bootHidden, setBootHidden] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(() =>
    typeof window === "undefined"
      ? true
      : !window.matchMedia("(max-width: 767px)").matches,
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 767px)").matches,
  );
  const [dragActive, setDragActive] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [lightboxAttachment, setLightboxAttachment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsState, setTtsState] = useState({ messageId: "", status: "idle" });

  const textareaRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const attachInputRef = useRef(null);
  const abortRef = useRef(null);
  const dragCounterRef = useRef(0);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentTtsAudioRef = useRef(null);
  const currentTtsUrlRef = useRef("");
  const ttsAbortRef = useRef(null);
  const transientMessageTimersRef = useRef(new Set());
  const speechSessionRef = useRef("");
  const speechBaseDraftRef = useRef("");
  const speechFinalTextRef = useRef("");
  const speechSilenceTimerRef = useRef(null);

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeSessionId) || sessions[0];
  }, [sessions, activeSessionId]);

  const activeMessages = activeSession?.messages || [];
  const currentDraft = draftsBySession[activeSession?.id || ""] || "";
  const currentPendingAttachments =
    pendingAttachmentsBySession[activeSession?.id || ""] || [];
  const connectorSpec = getConnectorSpec(config.provider);
  const connectorKey = providerKeys[config.provider] || "";
  const connectorBaseUrl =
    connectorBaseUrls[config.provider] || connectorSpec.defaultBaseUrl;

  const sortedSessions = useMemo(() => {
    return [...sessions].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();

    return sortedSessions
      .filter((session) => {
        if (!query) {
          return true;
        }

        const titleMatch = session.title.toLowerCase().includes(query);
        const messageMatch = session.messages.some((message) =>
          getMessagePlainText(message).toLowerCase().includes(query),
        );

        return titleMatch || messageMatch;
      })
      .map((session) => ({
        session,
        preview: getMatchingPreview(session, debouncedSearchQuery),
      }));
  }, [debouncedSearchQuery, sortedSessions]);

  const tokenEstimate = useMemo(() => estimateTokens(activeMessages), [activeMessages]);
  const activeSessionUpdatedLabel = useMemo(
    () => formatRelativeTime(activeSession?.updatedAt),
    [activeSession?.updatedAt],
  );
  const resultLabel = debouncedSearchQuery.trim()
    ? `${sessions.length} sessions -> ${filteredSessions.length} matches`
    : `${sessions.length} sessions`;

  function playSound(type = "click") {
    try {
      if (!audioRef.current) {
        audioRef.current = createAudioManager();
      }

      if (type === "transmit") {
        audioRef.current.transmit();
        return;
      }

      if (type === "error") {
        audioRef.current.error();
        return;
      }

      if (type === "purge") {
        audioRef.current.purge();
        return;
      }

      audioRef.current.click();
    } catch {
      // Audio is enhancement only.
    }
  }

  function updateSessionDraft(sessionId, value) {
    setDraftsBySession((current) => ({
      ...current,
      [sessionId]: value,
    }));
  }

  function updatePendingAttachments(sessionId, nextValue) {
    setPendingAttachmentsBySession((current) => {
      const previous = current[sessionId] || [];
      const nextAttachments =
        typeof nextValue === "function" ? nextValue(previous) : nextValue;

      return {
        ...current,
        [sessionId]: nextAttachments,
      };
    });
  }

  function updateSessionById(sessionId, updater) {
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        return updater(session);
      }),
    );
  }

  function appendSystemMessageToSession(sessionId, content, errorType = "error") {
    updateSessionById(sessionId, (session) => ({
      ...session,
      messages: [...session.messages, createSystemMessage(content, errorType)],
      updatedAt: new Date().toISOString(),
    }));
  }

  function removeMessageFromSession(sessionId, messageId) {
    updateSessionById(sessionId, (session) => ({
      ...session,
      messages: session.messages.filter((message) => message.id !== messageId),
      updatedAt: new Date().toISOString(),
    }));
  }

  function appendTemporarySystemMessageToSession(
    sessionId,
    content,
    errorType = "error",
    durationMs = 3000,
  ) {
    const message = createSystemMessage(content, errorType);

    updateSessionById(sessionId, (session) => ({
      ...session,
      messages: [...session.messages, message],
      updatedAt: new Date().toISOString(),
    }));

    const timer = window.setTimeout(() => {
      transientMessageTimersRef.current.delete(timer);
      removeMessageFromSession(sessionId, message.id);
    }, durationMs);

    transientMessageTimersRef.current.add(timer);
  }

  function cleanupCurrentTtsAudio() {
    if (currentTtsAudioRef.current) {
      currentTtsAudioRef.current.onended = null;
      currentTtsAudioRef.current.onerror = null;
      currentTtsAudioRef.current.pause();
      currentTtsAudioRef.current.currentTime = 0;
      currentTtsAudioRef.current = null;
    }

    if (currentTtsUrlRef.current) {
      URL.revokeObjectURL(currentTtsUrlRef.current);
      currentTtsUrlRef.current = "";
    }
  }

  function stopSpeaking() {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    cleanupCurrentTtsAudio();

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setTtsState({ messageId: "", status: "idle" });
  }

  function fallbackToWebSpeech(message) {
    if (!ttsSupported || !message?.content || typeof window === "undefined") {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message.content);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => voice.name.includes("Google")) || voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.pitch = 0.85;
    utterance.rate = 0.95;
    utterance.onend = () => setTtsState({ messageId: "", status: "idle" });
    utterance.onerror = () => setTtsState({ messageId: "", status: "idle" });

    setTtsState({ messageId: message.id, status: "playing" });
    window.speechSynthesis.speak(utterance);
  }

  async function speakMessage(message, withSound = true) {
    if (!message?.content) {
      return;
    }

    const isSameMessageActive =
      ttsState.messageId === message.id &&
      (ttsState.status === "loading" || ttsState.status === "playing");

    if (isSameMessageActive) {
      stopSpeaking();
      return;
    }

    if (withSound) {
      playSound("click");
    }

    stopSpeaking();

    const trimmedElevenLabsKey = elevenLabsKey.trim();
    const trimmedVoiceId = voiceId.trim();

    if (!trimmedElevenLabsKey || !trimmedVoiceId) {
      fallbackToWebSpeech(message);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, ELEVENLABS_TIMEOUT_MS);

    ttsAbortRef.current = controller;
    setTtsState({ messageId: message.id, status: "loading" });

    try {
      const response = await fetch(
        "/api/tts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            elevenLabsKey: trimmedElevenLabsKey,
            text: message.content,
            voiceId: trimmedVoiceId,
          }),
        },
      );

      if (response.status === 404) {
        appendTemporarySystemMessageToSession(
          activeSessionId,
          ELEVENLABS_INVALID_VOICE_WARNING,
          "error",
        );
        playSound("error");
        fallbackToWebSpeech(message);
        return;
      }

      if (!response.ok) {
        appendTemporarySystemMessageToSession(
          activeSessionId,
          ELEVENLABS_FALLBACK_WARNING,
          "error",
        );
        playSound("error");
        fallbackToWebSpeech(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      currentTtsUrlRef.current = url;
      currentTtsAudioRef.current = audio;
      audio.onended = () => {
        cleanupCurrentTtsAudio();
        setTtsState({ messageId: "", status: "idle" });
      };
      audio.onerror = () => {
        cleanupCurrentTtsAudio();
        setTtsState({ messageId: "", status: "idle" });
      };

      setTtsState({ messageId: message.id, status: "playing" });
      await audio.play();
    } catch (error) {
      if (error.name !== "AbortError") {
        appendTemporarySystemMessageToSession(
          activeSessionId,
          ELEVENLABS_FALLBACK_WARNING,
          "error",
        );
      } else {
        appendTemporarySystemMessageToSession(
          activeSessionId,
          ELEVENLABS_FALLBACK_WARNING,
          "error",
        );
      }

      playSound("error");
      fallbackToWebSpeech(message);
    } finally {
      window.clearTimeout(timeoutId);

      if (ttsAbortRef.current === controller) {
        ttsAbortRef.current = null;
      }
    }
  }

  async function processFiles(fileList, sessionId = activeSession.id) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }

    const currentCount = pendingAttachmentsBySession[sessionId]?.length || 0;
    const availableSlots = MAX_PENDING_ATTACHMENTS - currentCount;

    if (availableSlots <= 0) {
      appendSystemMessageToSession(sessionId, ATTACHMENT_LIMIT_WARNING);
      playSound("error");
      return;
    }

    const filesToRead = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      appendSystemMessageToSession(sessionId, ATTACHMENT_LIMIT_WARNING);
      playSound("error");
    }

    const processed = await Promise.all(
      filesToRead.map(async (file) => {
        if (file.size > MAX_FILE_BYTES) {
          appendSystemMessageToSession(sessionId, FILE_SIZE_WARNING);
          playSound("error");
          return null;
        }

        const kind = getAttachmentKind(file);
        if (kind === "unsupported") {
          appendSystemMessageToSession(sessionId, UNSUPPORTED_FILE_WARNING);
          playSound("error");
          return null;
        }

        if (kind === "text") {
          const textContent = await readFileAsText(file);
          return {
            id: generateId("attachment"),
            kind,
            name: file.name,
            size: file.size,
            mimeType: file.type || "text/plain",
            previewUrl: "",
            textContent,
            base64Data: "",
            language: inferLanguage(file.name),
            persisted: true,
          };
        }

        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: generateId("attachment"),
          kind,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          previewUrl: kind === "image" ? dataUrl : "",
          textContent: "",
          base64Data: dataUrl.split(",")[1] || "",
          language: kind === "pdf" ? "pdf" : "binary",
          persisted: false,
        };
      }),
    );

    const attachments = processed.filter(Boolean);
    if (attachments.length) {
      updatePendingAttachments(sessionId, (current) => [...current, ...attachments]);
    }
  }

  function createNewSession() {
    playSound("click");
    stopSpeaking();

    let nextSessions = sessions;
    let warningText = "";

    if (sessions.length >= MAX_SESSIONS) {
      const oldestSession = [...sessions].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      )[0];

      nextSessions = sessions.filter((session) => session.id !== oldestSession.id);
      warningText = SESSION_LIMIT_WARNING;
    }

    const nextSession = createBlankSession(warningText);
    setSessions([...nextSessions, nextSession]);
    setActiveSessionId(nextSession.id);
    setSessionsOpen(!isMobile);
  }

  function deleteSession(sessionId) {
    playSound("click");
    stopSpeaking();

    const remaining = sessions.filter((session) => session.id !== sessionId);
    if (pendingSessionId === sessionId) {
      abortRef.current?.abort();
      setIsResponding(false);
      setPendingSessionId("");
      setThinkingTimestamp("");
    }

    const nextSessions = remaining.length ? remaining : [createBlankSession()];
    const nextActiveId = sessionId === activeSessionId ? nextSessions[0].id : activeSessionId;

    setSessions(nextSessions);
    setActiveSessionId(nextSessions.some((session) => session.id === nextActiveId) ? nextActiveId : nextSessions[0].id);
    setDraftsBySession((current) => {
      const copy = { ...current };
      delete copy[sessionId];
      return copy;
    });
    setPendingAttachmentsBySession((current) => {
      const copy = { ...current };
      delete copy[sessionId];
      return copy;
    });
  }

  function exportSession(sessionId) {
    playSound("click");
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    const blob = new Blob([buildExportText(session)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${truncateText(session.title || "session", 20).replace(/[^a-z0-9_-]/gi, "_") || "session"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectSession(sessionId) {
    playSound("click");
    stopSpeaking();
    setActiveSessionId(sessionId);
    if (isMobile) {
      setSessionsOpen(false);
    }
  }

  function handleSearchChange(event) {
    setSearchQuery(event.target.value);
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      setSearchQuery("");
    }
  }

  function handlePurgeMemory() {
    playSound("purge");
    stopSpeaking();

    if (!activeSession) {
      return;
    }

    if (pendingSessionId === activeSession.id) {
      abortRef.current?.abort();
      setIsResponding(false);
      setPendingSessionId("");
      setThinkingTimestamp("");
    }

    setIsPurging(true);
    updateSessionById(activeSession.id, (session) => ({
      ...session,
      title: fallbackSessionTitle(session.createdAt),
      messages: [],
      updatedAt: new Date().toISOString(),
    }));
    updateSessionDraft(activeSession.id, "");
    updatePendingAttachments(activeSession.id, []);

    window.setTimeout(() => {
      setIsPurging(false);
    }, 300);

    if (isMobile) {
      setConfigOpen(false);
    }
  }

  function handleAuthenticate() {
    playSound("click");
    if (!connectorSpec.requiresKey) {
      setAuthKeyInput("");
      return;
    }

    if (!authKeyInput.trim()) {
      return;
    }

    setProviderKeys((current) => ({
      ...current,
      [config.provider]: authKeyInput.trim(),
    }));
  }

  function handleProviderChange(nextProvider) {
    const nextSpec = getConnectorSpec(nextProvider);

    setConfig((current) => ({
      ...current,
      provider: nextProvider,
      model:
        current.provider === nextProvider
          ? current.model
          : nextSpec.defaultModel,
    }));
    setAuthKeyInput(providerKeys[nextProvider] || "");
  }

  function handleUpdateConnectorKey(value) {
    setProviderKeys((current) => ({
      ...current,
      [config.provider]: value,
    }));

    if (config.provider === "anthropic") {
      window.localStorage.setItem("neurallink_api_key", value.trim());
    }
  }

  function handleUpdateConnectorBaseUrl(value) {
    setConnectorBaseUrls((current) => ({
      ...current,
      [config.provider]: value,
    }));
  }

  function handleUpdateElevenLabsKey(value) {
    setElevenLabsKey(value);

    if (value.trim()) {
      window.localStorage.setItem("neurallink_elevenlabs_key", value.trim());
      return;
    }

    window.localStorage.removeItem("neurallink_elevenlabs_key");
  }

  function handleUpdateVoiceId(value) {
    setVoiceId(value);

    if (value.trim()) {
      window.localStorage.setItem("neurallink_voice_id", value.trim());
      return;
    }

    window.localStorage.removeItem("neurallink_voice_id");
  }

  function handleOpenAttach() {
    playSound("click");
    attachInputRef.current?.click();
  }

  function handleSelectFiles(event) {
    void processFiles(event.target.files, activeSession.id);
    event.target.value = "";
  }

  function removePendingAttachment(attachmentId) {
    playSound("click");
    updatePendingAttachments(activeSession.id, (current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
  }

  function buildOutgoingUserMessage(sessionId) {
    const draft = draftsBySession[sessionId] || "";
    const pendingAttachments = pendingAttachmentsBySession[sessionId] || [];
    const textBlocks = pendingAttachments
      .filter((attachment) => attachment.kind === "text")
      .map((attachment) => {
        return `\`\`\`${attachment.language}\n${attachment.textContent}\n\`\`\``;
      });

    const content = [draft.trim(), ...textBlocks].filter(Boolean).join("\n\n");

    return {
      content,
      attachments: pendingAttachments,
    };
  }

  async function sendMessage(triggerSound = false) {
    if (
      !activeSession ||
      isResponding ||
      (connectorSpec.requiresKey && !connectorKey.trim())
    ) {
      return;
    }

    const sessionId = activeSession.id;
    const { attachments, content } = buildOutgoingUserMessage(sessionId);

    if (!content.trim() && !attachments.length) {
      return;
    }

    if (triggerSound) {
      playSound("transmit");
    }

    const userMessage = {
      id: generateId("msg"),
      role: "user",
      content,
      timestamp: formatTimestamp(),
      createdAt: new Date().toISOString(),
      errorType: "",
      attachments,
    };

    const targetSession = sessions.find((session) => session.id === sessionId) || activeSession;
    const hadUserMessage = targetSession.messages.some((message) => message.role === "user");
    const nextTitle = hadUserMessage
      ? targetSession.title
      : deriveSessionTitleFromMessage(userMessage, targetSession.createdAt);

    const nextMessages = [...targetSession.messages, userMessage];

    updateSessionById(sessionId, (session) => ({
      ...session,
      title: nextTitle,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    }));
    updateSessionDraft(sessionId, "");
    updatePendingAttachments(sessionId, []);
    setThinkingTimestamp(formatTimestamp());
    setIsResponding(true);
    setPendingSessionId(sessionId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const assistantText = await requestChatCompletion({
        apiKey: connectorKey,
        baseUrl: connectorBaseUrl,
        config,
        messages: nextMessages,
        signal: controller.signal,
      });

      const assistantMessage = {
        id: generateId("msg"),
        role: "assistant",
        content: assistantText,
        timestamp: formatTimestamp(),
        createdAt: new Date().toISOString(),
        errorType: "",
        attachments: [],
      };

      updateSessionById(sessionId, (session) => ({
        ...session,
        messages: [...session.messages, assistantMessage],
        updatedAt: new Date().toISOString(),
      }));
      setConnectionStatus("online");

      if (ttsEnabled) {
        window.setTimeout(() => {
          void speakMessage(assistantMessage, false);
        }, 50);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        playSound("error");
        setConnectionStatus("disconnected");
        appendSystemMessageToSession(
          sessionId,
          `[ TRANSMISSION FAILED: ${error.message} ]`,
          "error",
        );
      }
    } finally {
      abortRef.current = null;
      setIsResponding(false);
      setPendingSessionId("");
      setThinkingTimestamp("");
    }
  }

  function handleTextareaKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(false);
    }
  }

  function toggleConfig() {
    playSound("click");
    setConfigOpen((current) => !current);
    if (isMobile) {
      setSessionsOpen(false);
    }
  }

  function toggleSessions() {
    playSound("click");
    setSessionsOpen((current) => !current);
    if (isMobile) {
      setConfigOpen(false);
    }
  }

  function stopSpeechRecognition() {
    if (!recognitionRef.current) {
      return;
    }

    window.clearTimeout(speechSilenceTimerRef.current);
    recognitionRef.current.stop();
  }

  function resetSpeechSilenceTimer() {
    window.clearTimeout(speechSilenceTimerRef.current);
    speechSilenceTimerRef.current = window.setTimeout(() => {
      stopSpeechRecognition();
    }, 2000);
  }

  function toggleRecording() {
    if (!speechSupported || !recognitionRef.current || !activeSession) {
      return;
    }

    playSound("click");

    if (isRecording) {
      stopSpeechRecognition();
      return;
    }

    const sessionId = activeSession.id;
    speechSessionRef.current = sessionId;
    speechBaseDraftRef.current = draftsBySession[sessionId] || "";
    speechFinalTextRef.current = "";
    recognitionRef.current.lang = "en-US";
    recognitionRef.current.interimResults = true;
    recognitionRef.current.continuous = true;
    recognitionRef.current.start();
    setIsRecording(true);
    resetSpeechSilenceTimer();
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const handleChange = (event) => {
      setIsMobile(event.matches);
      if (event.matches) {
        setConfigOpen(false);
        setSessionsOpen(false);
      }
    };

    setIsMobile(media.matches);
    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    window.localStorage.setItem(
      "neurallink_sessions",
      JSON.stringify(sanitizeSessionsForStorage(sessions)),
    );
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      window.localStorage.setItem("neurallink_active_session_id", activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    window.localStorage.setItem("neurallink_tts", String(ttsEnabled));
  }, [ttsEnabled]);

  useEffect(() => {
    window.localStorage.setItem(
      "neurallink_provider_keys",
      JSON.stringify(providerKeys),
    );

    if (providerKeys.anthropic?.trim()) {
      window.localStorage.setItem("neurallink_api_key", providerKeys.anthropic.trim());
    } else {
      window.localStorage.removeItem("neurallink_api_key");
    }

    if (providerKeys.openai?.trim()) {
      window.localStorage.setItem("neurallink_openai_key", providerKeys.openai.trim());
    } else {
      window.localStorage.removeItem("neurallink_openai_key");
    }

    if (providerKeys.gemini?.trim()) {
      window.localStorage.setItem("neurallink_gemini_key", providerKeys.gemini.trim());
    } else {
      window.localStorage.removeItem("neurallink_gemini_key");
    }
  }, [providerKeys]);

  useEffect(() => {
    window.localStorage.setItem(
      "neurallink_connector_base_urls",
      JSON.stringify(connectorBaseUrls),
    );
  }, [connectorBaseUrls]);

  useEffect(() => {
    window.localStorage.setItem("neurallink_config", JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    setAuthKeyInput(providerKeys[config.provider] || "");
  }, [config.provider, providerKeys]);

  useEffect(() => {
    const timers = BOOT_LINES.map((_, index) =>
      window.setTimeout(() => {
        setBootLineCount(index + 1);
      }, index * 400),
    );

    const fadeTimer = window.setTimeout(() => {
      setBootFading(true);
    }, BOOT_LINES.length * 400 + 600);

    const hideTimer = window.setTimeout(() => {
      setBootHidden(true);
    }, BOOT_LINES.length * 400 + 1000);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    if (!activeSession && sessions[0]) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSession, sessions]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "0px";
    const nextHeight = Math.min(textareaRef.current.scrollHeight, 144);
    textareaRef.current.style.height = `${nextHeight}px`;
    textareaRef.current.style.overflowY =
      textareaRef.current.scrollHeight > 144 ? "auto" : "hidden";
  }, [currentDraft]);

  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(handle);
  }, [activeMessages, bootHidden, bootLineCount, currentPendingAttachments.length, isResponding, pendingSessionId]);

  useEffect(() => {
    if (!isResponding) {
      setThinkingFrame(0);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setThinkingFrame((current) => (current + 1) % 3);
    }, 420);

    return () => window.clearInterval(interval);
  }, [isResponding]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    setSpeechSupported(Boolean(SpeechRecognition));
    setTtsSupported(Boolean(window.speechSynthesis));

    if (!SpeechRecognition) {
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const sessionId = speechSessionRef.current;
      const baseText = speechBaseDraftRef.current;
      let finalText = speechFinalTextRef.current;
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          finalText = `${finalText}${transcript} `;
        } else {
          interimText += transcript;
        }
      }

      speechFinalTextRef.current = finalText;
      updateSessionDraft(sessionId, `${baseText}${finalText}${interimText}`.trimStart());
      resetSpeechSilenceTimer();
    };

    recognition.onend = () => {
      window.clearTimeout(speechSilenceTimerRef.current);
      setIsRecording(false);
    };

    recognition.onerror = () => {
      window.clearTimeout(speechSilenceTimerRef.current);
      setIsRecording(false);
    };

    return () => {
      window.clearTimeout(speechSilenceTimerRef.current);
      recognition.stop();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }

      if (event.ctrlKey && event.key === "/") {
        event.preventDefault();
        playSound("click");
        setConfigOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopSpeaking();
      transientMessageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      transientMessageTimersRef.current.clear();
    };
  }, []);

  const waitingForAuth = connectorSpec.requiresKey && !connectorKey.trim();
  const thinkingText = `[ DECRYPTING${".".repeat(thinkingFrame + 1)} ]`;
  const canSend = Boolean(currentDraft.trim() || currentPendingAttachments.length);

  return (
    <div
      className={`app-shell relative h-screen overflow-hidden text-[var(--text)] ${isPurging ? "screen-glitch" : ""}`}
    >
      <div className="relative z-10 mx-auto flex h-full max-w-[1480px] flex-col p-3 md:p-5">
        <CutFrame
          className="mb-3 shrink-0"
          cutClass="clip-panel"
          innerClassName="panel-shell px-4 py-4 md:px-6 md:py-5"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 xl:flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <p className="glitch-title label-track text-[13px] font-bold text-[var(--primary)]">
                  NEURALLINK_v2.0
                </p>
                <span className="hidden text-[10px] text-[var(--muted)] sm:block">
                  {"// blackwall relay // secure shard"}
                </span>
              </div>
              <p className="label-track mt-2 text-[11px] text-[var(--muted)]">
                SECURE CHANNEL ESTABLISHED
              </p>
            </div>

            <CutFrame
              className="header-active-session xl:min-w-[320px]"
              cutClass="clip-input"
              innerClassName="chip-fill px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label-track text-[10px] text-[var(--muted)]">
                    ACTIVE SESSION
                  </p>
                  <p className="mt-1 truncate text-[12px] text-[var(--text)]">
                    {activeSession.title}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[var(--muted)]">
                    {activeSessionUpdatedLabel}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--primary)]">
                    {activeMessages.filter((message) => message.role !== "system").length} msgs
                  </p>
                </div>
              </div>
            </CutFrame>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  label={connectionStatus === "online" ? "ONLINE" : "DISCONNECTED"}
                  pulse={connectionStatus === "online"}
                  tone={connectionStatus === "online" ? "online" : "disconnected"}
                />
                <StatusChip label="ENCRYPTED" tone="encrypted" />
                <StatusChip label="GHOST ACTIVE" tone="ghost" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
                  <p className="label-track text-[10px] text-[var(--muted)]">
                    {`${connectorSpec.label} // ${config.model}`}
                  </p>
                </CutFrame>
                <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
                  <p className="label-track text-[10px] text-[var(--muted)]">
                    ~{tokenEstimate.toLocaleString()} TOKENS
                  </p>
                </CutFrame>
                <button
                  className="cyber-button clip-button px-4 py-2 text-[11px] text-[var(--primary)] transition-all duration-150"
                  onClick={toggleSessions}
                  type="button"
                >
                  <span className="button-fill button-ghost">
                    {sessionsOpen ? "[ CLOSE SESSIONS ]" : "[ SESSIONS ]"}
                  </span>
                </button>
                <button
                  className="cyber-button clip-button px-4 py-2 text-[11px] text-black transition-all duration-150"
                  onClick={toggleConfig}
                  type="button"
                >
                  <span className="button-fill button-primary">
                    {isMobile ? "[ CONFIG ]" : configOpen ? "[ CLOSE CONFIG ]" : "[ CONFIG ]"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </CutFrame>

        <div className="min-h-0 flex-1 md:flex md:gap-4">
          <div
            className={`hidden overflow-hidden transition-[width,opacity,transform] duration-300 md:block ${sessionsOpen ? "w-[260px] opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-6 pointer-events-none"}`}
          >
            <CutFrame
              className="h-full"
              cutClass="clip-sheet"
              innerClassName="config-shell h-full p-5"
            >
              <SessionsPanelBody
                activeSessionId={activeSession.id}
                activeSessionTitle={activeSession.title}
                filteredSessions={filteredSessions}
                onCreateSession={createNewSession}
                onDeleteSession={deleteSession}
                onExportSession={exportSession}
                onSearchChange={handleSearchChange}
                onSearchFocus={() => playSound("click")}
                onSearchKeyDown={handleSearchKeyDown}
                onSelectSession={selectSession}
                query={searchQuery}
                resultLabel={resultLabel}
              />
            </CutFrame>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <CutFrame
              className="min-h-0 flex-1"
              cutClass="clip-panel"
              innerClassName="panel-shell relative flex h-full min-h-0 flex-col overflow-hidden"
            >
              <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-[rgba(255,255,255,0.06)] px-4 py-3 text-[10px] text-[var(--muted)] md:grid-cols-4 md:px-6">
                <p className="label-track">SESSION // {activeSession.title}</p>
                <p className="label-track">TEMP // {Number(config.temperature).toFixed(1)}</p>
                <p className="label-track">TOKENS // {tokenEstimate.toLocaleString()}</p>
                <p className="label-track">READY // {currentPendingAttachments.length} FILES</p>
              </div>

              <div
                className="relative min-h-0 flex-1 overflow-hidden"
                onDragEnter={(event) => {
                  event.preventDefault();
                  dragCounterRef.current += 1;
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  dragCounterRef.current -= 1;
                  if (dragCounterRef.current <= 0) {
                    setDragActive(false);
                    dragCounterRef.current = 0;
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dragCounterRef.current = 0;
                  setDragActive(false);
                  void processFiles(event.dataTransfer.files, activeSession.id);
                }}
              >
                {!bootHidden ? (
                  <BootOverlay bootFading={bootFading} bootLineCount={bootLineCount} />
                ) : null}

                {dragActive ? (
                  <div className="absolute inset-4 z-30 flex items-center justify-center rounded-[2px] border-2 border-dashed border-[var(--primary)] bg-[rgba(5,7,13,0.86)]">
                    <p className="label-track text-[12px] text-[var(--primary)]">
                      [ DROP FILE TO UPLOAD ]
                    </p>
                  </div>
                ) : null}

                <div
                  className="h-full overflow-y-auto px-4 py-4 md:px-6 md:py-5"
                  ref={scrollRef}
                >
                  {activeMessages.length === 0 && !isResponding ? (
                    <div className="flex h-full items-center justify-center">
                      <CutFrame
                        className="empty-state-panel w-full max-w-[520px]"
                        cutClass="clip-sheet"
                        innerClassName="auth-shell px-6 py-7"
                      >
                        <div className="space-y-4 text-center">
                          <p className="label-track text-[11px] text-[var(--primary)]">
                            CHANNEL IDLE
                          </p>
                          <p className="text-[15px] leading-7 text-[var(--text)]">
                            [ awaiting transmission ]
                          </p>
                          <p className="mx-auto max-w-[360px] text-[11px] leading-5 text-[var(--muted)]">
                            Start a new session, drop files into the relay, or jack in with a direct prompt to wake GHOST.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
                              <span className="text-[10px] text-[var(--muted)]">ATTACH // DROP FILES</span>
                            </CutFrame>
                            <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
                              <span className="text-[10px] text-[var(--muted)]">MIC // LIVE INPUT</span>
                            </CutFrame>
                          </div>
                        </div>
                      </CutFrame>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-[980px] space-y-5 pb-2">
                      {activeMessages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          onImageOpen={setLightboxAttachment}
                          onSpeakToggle={(nextMessage) => void speakMessage(nextMessage)}
                          ttsAvailable={Boolean(ttsSupported || (elevenLabsKey.trim() && voiceId.trim()))}
                          ttsButtonState={ttsState}
                        />
                      ))}

                      {isResponding && pendingSessionId === activeSession.id ? (
                        <ThinkingBubble
                          text={thinkingText}
                          timestamp={thinkingTimestamp || formatTimestamp()}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </CutFrame>

            <CutFrame
              className="shrink-0"
              cutClass="clip-panel"
              innerClassName="panel-shell px-4 py-4 md:px-6"
            >
              <AttachmentPreviewList
                attachments={currentPendingAttachments}
                onRemove={removePendingAttachment}
              />

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
                    <span className="text-[10px] text-[var(--muted)]">
                      {canSend ? "READY TO TRANSMIT" : "STANDBY"}
                    </span>
                  </CutFrame>
                  {currentPendingAttachments.length ? (
                    <CutFrame className="w-auto" cutClass="clip-chip" innerClassName="chip-fill px-3 py-2">
                      <span className="text-[10px] text-[var(--primary)]">
                        {currentPendingAttachments.length} ATTACHMENTS
                      </span>
                    </CutFrame>
                  ) : null}
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  {currentDraft.trim().length} chars
                </p>
              </div>

              <div className="flex items-end gap-3">
                <button
                  className="cyber-button clip-button shrink-0 px-4 py-3 text-[11px] text-[var(--primary)] transition-all duration-150"
                  onClick={handleOpenAttach}
                  type="button"
                >
                  <span className="button-fill button-ghost min-w-[96px]">
                    [ ATTACH ]
                  </span>
                </button>

                {speechSupported ? (
                  <button
                    className="cyber-button clip-button shrink-0 px-4 py-3 text-[11px] transition-all duration-150"
                    onClick={toggleRecording}
                    type="button"
                  >
                    <span className={`button-fill min-w-[82px] ${isRecording ? "button-live" : "button-ghost"}`}>
                      [ MIC ]
                    </span>
                  </button>
                ) : null}

                <CutFrame
                  className="console-shell flex-1"
                  cutClass="clip-input"
                  innerClassName="console-fill px-4 py-3"
                >
                  <div className="relative">
                    {!currentDraft ? (
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[14px] text-[var(--muted)]">
                        <span>jack_in &gt; </span>
                        <span className="blinking-underscore">_</span>
                      </div>
                    ) : null}
                    <textarea
                      className="console-textarea max-h-[144px] min-h-[48px] w-full resize-none bg-transparent text-[14px] leading-6 text-[var(--text)] caret-[var(--primary)] outline-none placeholder-transparent"
                      onChange={(event) => updateSessionDraft(activeSession.id, event.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder="jack_in > _"
                      ref={(node) => {
                        textareaRef.current = node;
                        inputRef.current = node;
                      }}
                      rows={1}
                      value={currentDraft}
                    />
                  </div>
                </CutFrame>

                <button
                  className="cyber-button clip-button shrink-0 self-stretch px-5 py-3 text-[12px] text-black transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isResponding || waitingForAuth || !canSend}
                  onClick={() => void sendMessage(true)}
                  type="button"
                >
                  <span className="button-fill button-primary min-w-[122px]">
                    TRANSMIT
                  </span>
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--muted)]">
                <span className="label-track">ENTER // SEND</span>
                <span className="label-track">SHIFT+ENTER // NEWLINE</span>
                <span className="label-track">CTRL+K // FOCUS</span>
                <span className="label-track">CTRL+/ // CONFIG</span>
              </div>

              <input
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                multiple
                onChange={handleSelectFiles}
                ref={attachInputRef}
                type="file"
              />
            </CutFrame>
          </div>

          <div
            className={`hidden overflow-hidden transition-[width,opacity,transform] duration-300 md:block ${configOpen ? "w-[280px] opacity-100 translate-x-0" : "w-0 opacity-0 translate-x-6 pointer-events-none"}`}
          >
            <CutFrame className="h-full" cutClass="clip-sheet" innerClassName="config-shell h-full p-5">
              <div className="mb-5">
                <p className="label-track text-[11px] text-[var(--primary)]">
                  CONFIG_CONSOLE
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  tuning live model parameters
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <ConfigFields
                  authRequired={connectorSpec.requiresKey}
                  connectorBaseUrl={connectorBaseUrl}
                  connectorKey={connectorKey}
                  connectorSpec={connectorSpec}
                  config={config}
                  elevenLabsKey={elevenLabsKey}
                  onPurge={handlePurgeMemory}
                  onProviderChange={handleProviderChange}
                  onToggleTtsSound={() => playSound("click")}
                  onUpdateConnectorBaseUrl={handleUpdateConnectorBaseUrl}
                  onUpdateConnectorKey={handleUpdateConnectorKey}
                  onUpdateElevenLabsKey={handleUpdateElevenLabsKey}
                  onUpdateVoiceId={handleUpdateVoiceId}
                  setConfig={setConfig}
                  setTtsEnabled={setTtsEnabled}
                  ttsEnabled={ttsEnabled}
                  voiceId={voiceId}
                />
              </div>
            </CutFrame>
          </div>
        </div>
      </div>

      <button
        aria-hidden={!isMobile || !sessionsOpen}
        className={`fixed inset-0 z-30 bg-black/70 backdrop-blur-sm transition-opacity duration-200 md:hidden ${isMobile && sessionsOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => {
          playSound("click");
          setSessionsOpen(false);
        }}
        type="button"
      />
      <div
        className={`fixed inset-y-4 left-4 z-40 w-[260px] max-w-[calc(100vw-2rem)] transition-transform duration-300 md:hidden ${isMobile && sessionsOpen ? "translate-x-0" : "-translate-x-[120%]"}`}
      >
        <CutFrame className="h-full" cutClass="clip-sheet" innerClassName="config-shell h-full p-5">
          <SessionsPanelBody
            activeSessionId={activeSession.id}
            activeSessionTitle={activeSession.title}
            filteredSessions={filteredSessions}
            onCreateSession={createNewSession}
            onDeleteSession={deleteSession}
            onExportSession={exportSession}
            onSearchChange={handleSearchChange}
            onSearchFocus={() => playSound("click")}
            onSearchKeyDown={handleSearchKeyDown}
            onSelectSession={selectSession}
            query={searchQuery}
            resultLabel={resultLabel}
          />
        </CutFrame>
      </div>

      <button
        aria-hidden={!isMobile || !configOpen}
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-200 md:hidden ${isMobile && configOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => {
          playSound("click");
          setConfigOpen(false);
        }}
        type="button"
      />
      <div
        className={`fixed inset-x-4 bottom-4 z-50 transition-transform duration-300 md:hidden ${isMobile && configOpen ? "translate-y-0" : "pointer-events-none translate-y-[120%]"}`}
      >
        <CutFrame className="max-h-[78vh]" cutClass="clip-sheet" innerClassName="config-shell flex max-h-[78vh] flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-track text-[11px] text-[var(--primary)]">
                CONFIG_CONSOLE
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                tuning live model parameters
              </p>
            </div>
            <button
              className="label-track text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
              onClick={() => {
                playSound("click");
                setConfigOpen(false);
              }}
              type="button"
            >
              [ CLOSE ]
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ConfigFields
              authRequired={connectorSpec.requiresKey}
              connectorBaseUrl={connectorBaseUrl}
              connectorKey={connectorKey}
              connectorSpec={connectorSpec}
              config={config}
              elevenLabsKey={elevenLabsKey}
              onPurge={handlePurgeMemory}
              onProviderChange={handleProviderChange}
              onToggleTtsSound={() => playSound("click")}
              onUpdateConnectorBaseUrl={handleUpdateConnectorBaseUrl}
              onUpdateConnectorKey={handleUpdateConnectorKey}
              onUpdateElevenLabsKey={handleUpdateElevenLabsKey}
              onUpdateVoiceId={handleUpdateVoiceId}
              setConfig={setConfig}
              setTtsEnabled={setTtsEnabled}
              ttsEnabled={ttsEnabled}
              voiceId={voiceId}
            />
          </div>
        </CutFrame>
      </div>

      {waitingForAuth ? (
        <AuthModal
          authKeyInput={authKeyInput}
          currentBaseUrl={connectorBaseUrl}
          onAuthenticate={handleAuthenticate}
          onProviderChange={handleProviderChange}
          provider={config.provider}
          providerSpec={connectorSpec}
          setAuthKeyInput={setAuthKeyInput}
        />
      ) : null}

      <Lightbox attachment={lightboxAttachment} onClose={() => setLightboxAttachment(null)} />

      {isPurging ? <div className="glitch-flash" /> : null}
    </div>
  );
}
