import type { Metadata } from "next";
import { BlackWhitePageClient } from "@/components/black-white-page-client";

export const metadata: Metadata = {
  title: "흑과 백 | BoardHub",
  description: "BoardHub의 흑과 백 실시간 1:1 심리전 페이지",
};

export default function BlackWhitePage() {
  return <BlackWhitePageClient />;
}
