import type { Metadata } from "next";
import { TwelveJanggiPageClient } from "@/components/twelve-janggi-page-client";

export const metadata: Metadata = {
  title: "십이장기 | BoardHub",
  description: "BoardHub의 십이장기 실시간 1:1 대전 페이지",
};

export default function TwelveJanggiPage() {
  return <TwelveJanggiPageClient />;
}
