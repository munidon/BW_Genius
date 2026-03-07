"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";

export type StarterRole = "lead" | "follow";

const START_ORDER_COIN_FRONT_SRC = "/images/start-order/coin-front.jpg";
const START_ORDER_COIN_BACK_SRC = "/images/start-order/coin-back.jpg";
const COIN_TURNS: Record<StarterRole, number> = {
  lead: 5,
  follow: 5.5,
};

export const STARTER_COIN_SPIN_DURATION_SEC = 2.6;
export const STARTER_COIN_RESULT_HOLD_MS = 1500;
export const STARTER_COIN_OVERLAY_DURATION_MS = Math.round(STARTER_COIN_SPIN_DURATION_SEC * 1000) + STARTER_COIN_RESULT_HOLD_MS;

export function StarterCoinOverlay({ role }: { role: StarterRole }) {
  const [progress, setProgress] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const roleLabel = role === "lead" ? "선 플레이어" : "후 플레이어";

  useEffect(() => {
    let active = true;
    let loaded = 0;
    const handleLoad = () => {
      loaded += 1;
      if (active && loaded === 2) setImageFailed(false);
    };
    const handleError = () => {
      if (active) setImageFailed(true);
    };

    const frontProbe = new window.Image();
    frontProbe.onload = handleLoad;
    frontProbe.onerror = handleError;
    frontProbe.src = START_ORDER_COIN_FRONT_SRC;

    const backProbe = new window.Image();
    backProbe.onload = handleLoad;
    backProbe.onerror = handleError;
    backProbe.src = START_ORDER_COIN_BACK_SRC;

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const startAt = performance.now();
    const durationMs = STARTER_COIN_SPIN_DURATION_SEC * 1000;
    setProgress(0);

    const animate = (now: number) => {
      const rawProgress = Math.min(1, (now - startAt) / durationMs);
      setProgress(rawProgress);
      if (rawProgress < 1) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [role]);

  const spinProgress = easeOutQuart(progress);
  const angle = spinProgress * COIN_TURNS[role] * Math.PI * 2;
  const faceScaleX = Math.max(0.04, Math.abs(Math.cos(angle)));
  const visibleFace = Math.cos(angle) >= 0 ? "front" : "back";
  const visibleFaceSrc = visibleFace === "front" ? START_ORDER_COIN_FRONT_SRC : START_ORDER_COIN_BACK_SRC;
  const fallbackLabel = visibleFace === "front" ? "선" : "후";
  const rise = -Math.sin(progress * Math.PI) * 18;
  const squash = 1 + Math.sin(progress * Math.PI) * 0.04;
  const settleScale = 0.84 + easeOutBack(Math.min(progress / 0.28, 1)) * 0.16;
  const wobble = Math.sin(progress * Math.PI * 2.5) * (1 - progress) * 5;
  const shadowScaleX = 0.76 + (1 - faceScaleX) * 0.24;
  const shadowScaleY = 0.56 + faceScaleX * 0.18;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-52 w-52 md:h-64 md:w-64" style={{ perspective: "1200px", WebkitPerspective: "1200px" }}>
          <div
            className="absolute left-1/2 top-[78%] h-7 w-[72%] -translate-x-1/2 rounded-full bg-black/45 blur-xl md:h-8"
            style={{
              transform: `translateX(-50%) scale(${shadowScaleX}, ${shadowScaleY})`,
              opacity: 0.55 + faceScaleX * 0.2,
            }}
          />

          <div
            className="relative h-full w-full overflow-hidden rounded-full border-2 border-amber-100/80 shadow-[0_20px_42px_rgba(0,0,0,0.55)]"
            style={{
              transform: `translateY(${rise}px) rotateX(${-10 + (1 - progress) * -2}deg) rotateZ(${wobble}deg) scale(${settleScale}) scaleX(${faceScaleX}) scaleY(${squash})`,
              transformOrigin: "50% 50%",
              willChange: "transform",
            }}
          >
            {imageFailed ? (
              <FallbackCoinFace label={fallbackLabel} />
            ) : (
              <Image
                key={visibleFaceSrc}
                src={visibleFaceSrc}
                alt=""
                aria-hidden="true"
                fill
                priority
                sizes="(max-width: 768px) 208px, 256px"
                className="scale-[1.08] object-cover object-center select-none"
                draggable={false}
              />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_28%,rgba(255,245,200,0.38),transparent_34%),radial-gradient(circle_at_70%_76%,rgba(0,0,0,0.18),transparent_42%)]" />
            <div className="absolute inset-[4%] rounded-full border border-white/10" />
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.max(0.1, STARTER_COIN_SPIN_DURATION_SEC - 0.4) }}
          className="text-2xl font-black tracking-wide text-amber-100 md:text-3xl"
        >
          {roleLabel}
        </motion.p>
      </div>
    </motion.div>
  );
}

function FallbackCoinFace({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700 text-8xl font-black text-amber-100">
      {label}
    </div>
  );
}

function easeOutQuart(value: number) {
  return 1 - (1 - value) ** 4;
}

function easeOutBack(value: number) {
  const overshoot = 1.70158;
  const shifted = value - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}
