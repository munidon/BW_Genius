"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdsenseBannerProps = {
  className?: string;
  labelClassName?: string;
  title?: string;
  description?: string;
};

const ADSENSE_CLIENT = "ca-pub-5091515187087145";
const TOP_BANNER_SLOT = process.env.NEXT_PUBLIC_ADSENSE_TOP_BANNER_SLOT;

export function AdsenseBanner({
  className = "",
  labelClassName = "",
  title = "Sponsored",
  description = "상단 배너 광고 영역",
}: AdsenseBannerProps) {
  useEffect(() => {
    if (!TOP_BANNER_SLOT || typeof window === "undefined") return;

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ignore duplicate or premature ad initializations from the client runtime.
    }
  }, []);

  if (!TOP_BANNER_SLOT) {
    return (
      <section
        aria-label="광고 배너 자리"
        className={`rounded-[1.5rem] border border-dashed border-white/15 bg-black/20 p-4 backdrop-blur-xl ${className}`.trim()}
      >
        <p className={`text-[11px] font-bold uppercase tracking-[0.35em] text-white/45 ${labelClassName}`.trim()}>
          Ads
        </p>
        <div className="mt-3 flex min-h-[96px] items-center justify-center rounded-[1.1rem] border border-white/10 bg-black/25 px-4 text-center text-sm text-white/65">
          `NEXT_PUBLIC_ADSENSE_TOP_BANNER_SLOT` 값을 넣으면 이 위치에 상단 애드센스 배너가 노출됩니다.
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="광고 배너"
      className={`rounded-[1.5rem] border border-white/10 bg-black/20 p-4 backdrop-blur-xl ${className}`.trim()}
    >
      <p className={`text-[11px] font-bold uppercase tracking-[0.35em] text-white/45 ${labelClassName}`.trim()}>
        {title}
      </p>
      <div className="mt-3 overflow-hidden rounded-[1.1rem] border border-white/10 bg-black/25 px-2 py-2">
        <ins
          className="adsbygoogle block"
          style={{ display: "block", minHeight: "96px" }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={TOP_BANNER_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
      <p className="mt-2 text-xs text-white/45">{description}</p>
    </section>
  );
}
