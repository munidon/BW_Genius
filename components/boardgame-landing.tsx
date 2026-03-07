"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdsenseBanner } from "@/components/adsense-banner";
import { useAuth } from "@/components/auth-provider";
import { BOARD_GAMES } from "@/lib/board-games";

export function BoardgameLanding() {
  const router = useRouter();
  const {
    userId,
    nickname,
    requiresNickname,
    isLoading,
    profileLoading,
    isBusy,
    error,
    clearError,
    signInWithGoogle,
    saveNickname,
    logout,
  } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  useEffect(() => {
    setNicknameInput(nickname);
  }, [nickname, userId]);

  const handleAuthModalClose = () => {
    if (isBusy) return;
    clearError();
    setAuthModalOpen(false);
  };

  const openLoginModal = () => {
    clearError();
    setAuthModalOpen(true);
  };

  const handleGameClick = (href: string, available: boolean) => {
    if (!available) return;
    if (isLoading || profileLoading) return;
    if (!userId) {
      window.alert("로그인을 먼저 해주십시오");
      setAuthModalOpen(true);
      return;
    }
    if (requiresNickname) {
      window.alert("닉네임을 먼저 설정해 주십시오");
      return;
    }
    router.push(href);
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 text-slate-100 md:px-8 md:py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-16 h-52 w-52 rounded-full bg-amber-200/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-red-500/10 blur-3xl" />
        <div className="absolute bottom-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-orange-300/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-white/10 bg-black/35 p-5 backdrop-blur-xl md:p-7">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl text-center md:text-left">
                <p className="text-xs font-bold uppercase tracking-[0.45em] text-amber-100/75">BoardHub</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
                  한 곳에서 고르고,
                  <br />
                  바로 입장하는,
                  <br />
                  보드게임 허브
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-red-50/70 md:text-base">
                  로그인하고, 원하는 게임을 선택하면
                  <br />
                  해당 보드게임을 바로 즐기실 수 있습니다!
                </p>
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-black/30 p-4">
              {isLoading || profileLoading ? (
                <p className="text-sm text-red-50/70">계정 정보를 확인하는 중입니다.</p>
              ) : userId && requiresNickname ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/70">Nickname Setup</p>
                  <p className="mt-2 text-lg font-bold text-white">처음 로그인하셨다면 닉네임을 먼저 정해 주세요.</p>
                  <p className="mt-1 text-sm text-red-50/65">이 닉네임이 랜딩과 흑과백 양쪽에 표시됩니다.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={nicknameInput}
                      onChange={(event) => setNicknameInput(event.target.value)}
                      placeholder="닉네임"
                      className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-sm text-white outline-none placeholder:text-red-50/35"
                    />
                    <button
                      type="button"
                      onClick={() => void saveNickname(nicknameInput)}
                      disabled={isBusy}
                      className="rounded-full bg-[#d84627] px-4 py-2 text-sm font-black text-white transition hover:bg-[#ee5738] disabled:opacity-60"
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : userId ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/70">Welcome</p>
                    <p className="mt-2 text-lg font-bold text-white">{nickname || "플레이어"}</p>
                    <p className="mt-1 text-sm text-red-50/65">원하는 게임을 선택해서 즐겨주세요!</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    disabled={isBusy}
                    className="shrink-0 whitespace-nowrap rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"
                  >
                    로그아웃
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/70">Log in</p>
                    <p className="mt-2 text-lg font-bold text-white">로그인 후 게임에 입장할 수 있습니다!</p>
                  </div>
                  <button
                    type="button"
                    onClick={openLoginModal}
                    disabled={isBusy}
                    className="shrink-0 whitespace-nowrap rounded-full bg-[#d84627] px-4 py-2 text-sm font-black text-white transition hover:bg-[#ee5738] disabled:opacity-60"
                  >
                    로그인
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <AdsenseBanner className="mt-[-0.25rem]" />

        {error && (
          <div className="rounded-2xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {BOARD_GAMES.map((game, index) => (
            <motion.button
              key={game.slug}
              type="button"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.08 }}
              onClick={() => handleGameClick(game.href, game.available)}
              className={`group relative overflow-hidden rounded-[1.75rem] border p-5 text-left backdrop-blur-xl transition ${game.available
                ? "border-white/10 bg-black/35 hover:-translate-y-1 hover:border-amber-200/40 hover:bg-black/45"
                : "cursor-default border-white/5 bg-black/20 opacity-70"
                }`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 ${game.available ? "bg-gradient-to-r from-amber-200 via-orange-400 to-red-500" : "bg-white/10"
                  }`}
              />
              <div className="mb-5 overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/30">
                {game.imageSrc ? (
                  <Image
                    src={game.imageSrc}
                    alt={`${game.title} 대표 이미지`}
                    width={800}
                    height={520}
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-44 items-center justify-center px-6 text-center ${game.available
                        ? "bg-[radial-gradient(circle_at_top,rgba(163,230,53,0.16),transparent_55%),linear-gradient(135deg,rgba(16,185,129,0.18),rgba(255,255,255,0.02))]"
                        : "bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]"
                      }`}
                  >
                    <div>
                      <p
                        className={`text-xl font-bold uppercase tracking-[0.35em] ${game.available ? "text-lime-100/75" : "text-amber-100/60"
                          }`}
                      >
                        {game.available ? game.subtitle : "Coming Soon"}
                      </p>
                      {game.available && <p className="mt-3 text-sm font-bold text-emerald-50/70">PLAY NOW</p>}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/70">{game.subtitle}</p>
                  <h2 className="mt-3 text-2xl font-black text-white">{game.title}</h2>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${game.available
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "bg-white/10 text-red-50/70"
                    }`}
                >
                  {game.available ? "PLAYABLE" : "COMING SOON"}
                </span>
              </div>

              <p className="mt-4 min-h-16 text-sm leading-6 text-red-50/70">{game.description}</p>

              <div className="mt-8 flex items-center justify-between">
                <span className="text-sm font-bold text-white/85">
                  {game.available ? "입장하기" : "준비 중"}
                </span>
                <span
                  className={`text-xl transition ${game.available ? "text-amber-200 group-hover:translate-x-1" : "text-white/35"
                    }`}
                >
                  →
                </span>
              </div>
            </motion.button>
          ))}
        </section>
      </div>

      <AnimatePresence>
        {authModalOpen && !userId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#120708] p-6 shadow-2xl shadow-black/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/70">Sign In</p>
                  <h3 className="mt-2 text-2xl font-black text-white">로그인할 방법을 선택해 주세요</h3>
                </div>
                <button
                  type="button"
                  onClick={handleAuthModalClose}
                  disabled={isBusy}
                  className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/80 disabled:opacity-60"
                >
                  닫기
                </button>
              </div>

              <button
                type="button"
                onClick={() => void signInWithGoogle("/")}
                disabled={isBusy}
                className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 disabled:opacity-60"
              >
                Google로 로그인
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
