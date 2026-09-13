"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setAuthToken } from "@/lib/api";

// 与后端 MIN_ADMIN_PASSWORD_LENGTH 保持一致。前端拦一道只是为了少一次往返，
// 真正的判据在服务端；两侧若漂移，以服务端为准。
const MIN_LENGTH = 12;

export function AccountForm({ username }: { username: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(false);

    if (next !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`新密码至少 ${MIN_LENGTH} 位`);
      return;
    }

    setLoading(true);
    try {
      const data = await api.changePassword(current, next);
      // 关键：后端已把旧令牌全部作废，这里必须立刻换成新代次的令牌，
      // 否则当前这台设备会在下一个请求收到 401 被踢回登录页。
      setAuthToken(data.access_token);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "修改失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card max-w-lg p-5 sm:p-6">
      <p className="text-meta text-muted">
        当前账号：<span className="font-medium text-foreground">{username}</span>
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="current-password" className="field-label">
            当前密码
          </label>
          <input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            className="input"
          />
        </div>

        <div>
          <label htmlFor="new-password" className="field-label">
            新密码
          </label>
          <input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            required
            aria-describedby="new-password-hint"
            className="input"
          />
          <p id="new-password-hint" className="mt-1.5 text-meta text-muted">
            至少 {MIN_LENGTH} 位，且不能与当前密码相同。
          </p>
        </div>

        <div>
          <label htmlFor="confirm-password" className="field-label">
            再次输入新密码
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className="input"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-meta text-error">
          {error}
        </p>
      )}

      {done && (
        <p role="status" className="mt-4 text-meta text-success">
          密码已更新。其它设备上的登录已全部失效，需要重新登录；当前设备不受影响。
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "提交中…" : "修改密码"}
        </button>
      </div>
    </form>
  );
}
