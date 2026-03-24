import { requestChatCompletion } from "@/lib/server/connectors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const content = await requestChatCompletion({
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      config: payload.config,
      messages: payload.messages || [],
      signal: request.signal,
    });

    return Response.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
