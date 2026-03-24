import { requestTtsStream } from "@/lib/server/connectors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return requestTtsStream(payload, request.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
