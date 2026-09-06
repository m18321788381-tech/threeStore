"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, authToken, setAuthToken } from "@/lib/api";

/** 后台守卫：无 token 或 token 失效时回登录页。 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authToken()) {
      router.replace("/admin/login");
      return;
    }
    api
      .me()
      .then(() => setReady(true))
      .catch(() => {
        setAuthToken(null);
        router.replace("/admin/login");
      });
  }, [router]);

  if (!ready) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32" />
      </div>
    );
  }

  return <>{children}</>;
}
