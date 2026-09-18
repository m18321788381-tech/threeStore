import type { Metadata } from "next";
import { ReadingList } from "@/components/post/ReadingList";
import { Breadcrumb } from "@/components/common/Breadcrumb";

export const metadata: Metadata = {
  title: "稍后读",
  description: "保存在本机的稍后读列表",
  /* 纯本地列表页：对搜索引擎无意义，也避免把读者私有数据暴露出去 */
  robots: { index: false, follow: false },
};

/* 稍后读列表页。

   数据全部来自浏览器 localStorage（见 lib/reading.ts），因此这里只做
   静态外壳，内容由客户端组件渲染 —— 服务端既拿不到也不该拿到这份数据。 */
export default function ReadingPage() {
  return (
    <div className="mx-auto max-w-content">
      <Breadcrumb items={[{ name: "稍后读" }]} />
      <header className="page-head">
        <h1 className="page-title">稍后读</h1>
        <p className="page-desc">
          这里收集的文章保存在你自己的浏览器里，不会上传到服务器，换设备或清空浏览器数据后会消失。
        </p>
      </header>
      <ReadingList />
    </div>
  );
}
