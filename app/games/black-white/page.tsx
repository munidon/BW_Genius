import type { Metadata } from "next";
import { BlackWhitePageClient } from "@/components/black-white-page-client";

export const metadata: Metadata = {
  title: "흑과 백 | 보드게임 라운지",
  description: "보드게임 라운지의 흑과 백 실시간 1:1 심리전 페이지",
};

export default function BlackWhitePage() {
  return <BlackWhitePageClient />;
}
