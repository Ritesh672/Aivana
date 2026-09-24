// all calls to the fastapi backend live here

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function toApiError(res) {
  let detail = null;
  try {
    detail = (await res.json()).detail;
  } catch (_) {}
  // model errors come back as {code, message}; others as a plain string
  if (detail && typeof detail === "object" && detail.code) {
    return new ApiError(res.status, detail.code, detail.message);
  }
  const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg : null;
  return new ApiError(res.status, "http_error", message || `Request failed (${res.status})`);
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export const api = {
  me: () => request("/auth/me"),
  signup: (email, password) => request("/auth/signup", { method: "POST", body: { email, password } }),
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request("/auth/logout", { method: "POST" }),

  models: () => request("/models"),

  chats: (q = "") => request(q ? `/chats?q=${encodeURIComponent(q)}` : "/chats"),
  messages: (chatId) => request(`/chats/${chatId}/messages`),
  deleteChat: (chatId) => request(`/chats/${chatId}`, { method: "DELETE" }),

  settings: () => request("/settings"),
  saveSettings: (settings) => request("/settings", { method: "PUT", body: settings }),

  keys: () => request("/keys"),
  saveKey: (provider, apiKey) => request(`/keys/${provider}`, { method: "PUT", body: { api_key: apiKey } }),
  deleteKey: (provider) => request(`/keys/${provider}`, { method: "DELETE" }),
};

// send a message and read the server-sent events as they arrive.
// onEvent(name, data) is called for "meta", "token", "done" and "error".
// abort the signal to stop generating.
export async function streamChat({ message, model, chatId }, signal, onEvent) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, model, chat_id: chatId }),
    signal,
  });
  if (!res.ok) throw await toApiError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // events are separated by a blank line
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}
