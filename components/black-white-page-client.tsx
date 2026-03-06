"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { BlackWhiteOnline } from "@/components/black-white-online";

export function BlackWhitePageClient() {
  const router = useRouter();
  const { userId, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || userId) return;
    window.alert("로그인을 먼저 해주십시오");
    router.replace("/");
  }, [isLoading, userId, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-5 text-sm text-red-50/75 backdrop-blur-xl">
          로그인 상태를 확인하는 중입니다.
        </div>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-center backdrop-blur-xl">
          <p className="text-lg font-bold text-white">로그인이 필요합니다.</p>
          <p className="mt-2 text-sm text-red-50/70">랜딩 페이지에서 로그인한 뒤 다시 입장해 주세요.</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-full bg-[#d84627] px-4 py-2 text-sm font-bold text-white"
          >
            랜딩으로 이동
          </Link>
        </div>
      </main>
    );
  }

  return <BlackWhiteOnline entryHref="/" />;
}
