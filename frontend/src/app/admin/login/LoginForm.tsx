"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setAuthToken } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(username.trim(), password);
      setAuthToken(data.access_token);
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-7 space-y-4 text-left">
      <div>
        <label htmlFor="username" className="field-label">
          用户名
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="input"
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          密码
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="input"
        />
      </div>

      {error && (
        <p role="alert" className="text-meta text-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
