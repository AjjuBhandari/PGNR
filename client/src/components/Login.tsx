import { useState } from "react";
import { api } from "../lib/api";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      const { token, error } = await api.login(username, password);
      if (!token) throw new Error(error || "Login failed");
      localStorage.setItem("token", token);
      onLoggedIn();
    } catch (e: any) {
      setError(e.message || "Login failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-mc-bg">
      <div className="w-80 bg-mc-panel border border-mc-border rounded-lg p-6 space-y-3">
        <h1 className="text-sm font-semibold">Bot Manager Login</h1>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full bg-black/30 border border-mc-border rounded px-2 py-1.5 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          className="w-full bg-black/30 border border-mc-border rounded px-2 py-1.5 text-sm"
        />
        {error && <div className="text-xs text-mc-red">{error}</div>}
        <button className="btn btn-primary w-full justify-center" onClick={submit}>
          Sign in
        </button>
      </div>
    </div>
  );
}
