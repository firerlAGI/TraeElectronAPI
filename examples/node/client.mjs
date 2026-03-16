/*
Minimal TraeAPI example client using Node.js >= 22.

Usage:
  node examples/node/client.mjs

Environment variables:
  TRAE_API_BASE_URL   default: http://127.0.0.1:8787
  TRAE_API_TOKEN      optional bearer token
  TRAE_API_PROMPT     prompt to send
  TRAE_API_STREAM     1 to use SSE stream mode, 0 for blocking mode
*/

const baseUrl = (process.env.TRAE_API_BASE_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const token = String(process.env.TRAE_API_TOKEN || "").trim();
const prompt = process.env.TRAE_API_PROMPT || "Reply with exactly: NODE_OK";
const useStream = String(process.env.TRAE_API_STREAM || "1").trim() !== "0";

function buildHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: buildHeaders(options.headers || {})
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return {
    status: response.status,
    payload
  };
}

async function sendMessage(content) {
  const { status, payload } = await requestJson("/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      sessionMetadata: {
        client: "node-example"
      }
    })
  });
  if (status !== 200) {
    throw new Error(`Message request failed: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function parseSseChunk(rawChunk) {
  let eventName = "message";
  const dataLines = [];
  for (const line of rawChunk.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (!dataLines.length) {
    return null;
  }
  return {
    event: eventName,
    data: JSON.parse(dataLines.join("\n"))
  };
}

async function streamMessage(content) {
  const response = await fetch(`${baseUrl}/v1/chat/stream`, {
    method: "POST",
    headers: buildHeaders({
      Accept: "text/event-stream",
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      content,
      sessionMetadata: {
        client: "node-example"
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stream request failed: ${text}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");
      const parsed = parseSseChunk(rawEvent);
      if (!parsed) {
        continue;
      }

      if (parsed.event === "delta") {
        console.log(`[delta/${parsed.data.type}]`, parsed.data.chunk);
      } else if (parsed.event === "done") {
        finalText = parsed.data?.result?.response?.text || "";
        console.log("[done]");
        return finalText;
      } else if (parsed.event === "error") {
        throw new Error(`Stream error: ${JSON.stringify(parsed.data)}`);
      } else {
        console.log(`[${parsed.event}]`, JSON.stringify(parsed.data));
      }
    }
  }

  return finalText;
}

async function main() {
  const ready = await requestJson("/ready");
  if (ready.status !== 200) {
    console.error("Gateway is not ready:");
    console.error(JSON.stringify(ready.payload, null, 2));
    process.exit(1);
  }

  if (!useStream) {
    const payload = await sendMessage(prompt);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const finalText = await streamMessage(prompt);
  if (finalText) {
    console.log("Final text:");
    console.log(finalText);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
