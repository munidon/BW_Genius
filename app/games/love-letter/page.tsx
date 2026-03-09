import type { Metadata } from "next";
import { LoveLetterPageClient } from "@/components/love-letter-page-client";

export const metadata: Metadata = {
  title: "러브 레터 | BoardHub",
  description: "BoardHub의 러브 레터 실시간 다인전 페이지",
};

export default function LoveLetterPage() {
  return <LoveLetterPageClient />;
}
