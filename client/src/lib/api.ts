const BASE = import.meta.env.VITE_API_URL || "/api";

function headers() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function req(path: string, opts: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers: headers() });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Dashboard API is unreachable at ${BASE}. Start the backend and try again.`);
    }
    throw error;
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (username: string, password: string) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then((r) => r.json()),
  listBots: () => req("/bots"),
  analytics: () => req("/analytics"),
  addBot: (body: { username: string; password?: string; version?: string; host?: string }) =>
    req("/bots", { method: "POST", body: JSON.stringify(body) }),
  updateBot: (id: string, body: { username?: string; password?: string; version?: string; host?: string }) =>
    req(`/bots/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  startAll: () => req("/bots/start-all", { method: "POST" }),
  startBot: (id: string) => req(`/bots/${id}/start`, { method: "POST" }),
  stopBot: (id: string) => req(`/bots/${id}/stop`, { method: "POST" }),
  restartBot: (id: string) => req(`/bots/${id}/restart`, { method: "POST" }),
  sendCommand: (id: string, action: string, params?: Record<string, unknown>, raw?: string) =>
    req(`/bots/${id}/command`, { method: "POST", body: JSON.stringify({ action, params, raw }) }),
  commandHistory: (id: string) => req(`/bots/${id}/commands`),
  toggleAi: (id: string, enabled: boolean) =>
    req(`/bots/${id}/ai/toggle`, { method: "POST", body: JSON.stringify({ enabled }) }),
  aiConfig: () => req("/ai/config"),
  aiDecisions: (id: string) => req(`/bots/${id}/ai/decisions`),
  setAiGoal: (id: string, goal: string) =>
    req(`/bots/${id}/ai/goal`, { method: "POST", body: JSON.stringify({ goal }) }),
  setAiInterval: (id: string, intervalMs: number) =>
    req(`/bots/${id}/ai/interval`, { method: "POST", body: JSON.stringify({ intervalMs }) }),
};
