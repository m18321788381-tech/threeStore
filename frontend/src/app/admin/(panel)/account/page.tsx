import { cookies } from "next/headers";
import { serverGet } from "@/lib/api";
import { AccountForm } from "./AccountForm";

export const dynamic = "force-dynamic";

/**
 * 账号安全页。
 *
 * 此前这个页面不存在，意味着 `token_version` 那样的吊销能力即便做了也没有触发器 ——
 * 而「改密码后旧令牌仍有效」是一个用户以为已经处理、实际没处理的安全缺口。
 * 用户名在服务端取，避免为了显示一行文字再多打一次接口。
 */
export default async function AdminAccountPage() {
  const token = (await cookies()).get("blog_token")?.value;
  const me = await serverGet<{ username: string; display_name: string }>("/auth/me", {
    token: token ?? undefined,
    revalidate: 0,
  });

  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">账号安全</h1>
          <p className="mt-1 text-meta text-muted">
            修改密码后，该账号此前签发的全部登录凭证会立即失效——包括其它设备上的会话。
          </p>
        </div>
      </header>

      {me ? (
        <AccountForm username={me.username} />
      ) : (
        <p className="text-meta text-error">无法读取账号信息，请重新登录后再试。</p>
      )}
    </>
  );
}
