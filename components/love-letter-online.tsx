"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  formatLlTimestamp,
  formatLoveLetterError,
  getLlCurrentHandCount,
  getLlDefaultValidTargetIds,
  getLlPublicDiscardSum,
  getLlRoundEndReasonLabel,
  getLlSeatPlacements,
  getLlTurnNotice,
  getLlVisibleHand,
  getLoveLetterCard,
  getLoveLetterGuessableCards,
  getLoveLetterPhaseLabel,
  getLoveLetterStatusChipClass,
  getLoveLetterStatusLabel,
  getLoveLetterTokenGoal,
  LOVE_LETTER_PLAYER_LIMITS,
  LOVE_LETTER_RULE_SUMMARY,
  normalizeLlRoomPlayers,
  normalizeLlRoomRow,
  normalizeLlRoomView,
  resolveLlRpcEnvelope,
  type LlCardDefinition,
  type LlCardId,
  type LlPrivateResult,
  type LlPlayerLimit,
  type LlRoomPlayerRow,
  type LlRoomRow,
  type LlRoomView,
} from "@/lib/love-letter";
import { supabase } from "@/lib/supabase";

type PlayerRecord = {
  matches: number;
  matchWins: number;
  roundWins: number;
};

const EMPTY_RECORD: PlayerRecord = {
  matches: 0,
  matchWins: 0,
  roundWins: 0,
};

function RoundMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/55">{label}</p>
      <p className="mt-2 text-sm font-bold text-white md:text-base">{value}</p>
    </div>
  );
}

function LoveLetterRoomPlayerCard({
  title,
  name,
  stateText,
  tokenText,
  emphasized,
}: {
  title: string;
  name: string;
  stateText: string;
  tokenText: string;
  emphasized: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-black/35 p-3 ${emphasized ? "border-2 border-white/90" : "border border-[#ffd5cc]/20"
        }`}
    >
      <p className="text-sm text-[#f8e6e2]/70">{title}</p>
      <p className="text-lg font-bold text-white">{name}</p>
      <p className="text-sm text-white/85">{stateText}</p>
      <p className="mt-1 text-xs text-[#f8e6e2]/80">{tokenText}</p>
    </div>
  );
}

function PlayerTokenTrackCard({
  name,
  count,
  goal,
  emphasized,
  champion = false,
}: {
  name: string;
  count: number;
  goal: number;
  emphasized: boolean;
  champion?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border p-4 backdrop-blur-xl ${champion
        ? "border-amber-200/40 bg-amber-200/10 shadow-[0_0_32px_rgba(251,191,36,0.14)]"
        : emphasized
          ? "border-white/30 bg-white/10"
          : "border-white/10 bg-black/20"
        }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-base font-black text-white">{name}</p>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white/65">
          {count} / {goal}
        </span>
      </div>
      <div className="mt-4">
        <TokenTrack count={count} goal={goal} compact />
      </div>
    </div>
  );
}

function TokenTrack({
  count,
  goal,
  compact = false,
}: {
  count: number;
  goal: number;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "justify-start" : "justify-center"}`}>
      {Array.from({ length: goal }, (_, index) => {
        const filled = index < count;
        return (
          <div
            key={index}
            className={`relative overflow-hidden rounded-full border ${compact ? "h-8 w-8" : "h-10 w-10"} ${filled
              ? "border-amber-200/70 bg-amber-100/15 shadow-[0_0_24px_rgba(255,214,102,0.22)]"
              : "border-white/10 bg-white/5"
              }`}
          >
            {filled ? (
              <Image
                src="/images/love_letters/love_letters_token.png"
                alt="비밀 폴라로이드 토큰"
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] font-black text-white/35">
                {index + 1}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoveLetterCardFace({
  cardId,
  hidden = false,
  compact = false,
  featured = false,
  imageOnly = false,
  selected = false,
  disabled = false,
  emphasis = false,
  onClick,
}: {
  cardId?: LlCardId;
  hidden?: boolean;
  compact?: boolean;
  featured?: boolean;
  imageOnly?: boolean;
  selected?: boolean;
  disabled?: boolean;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  const definition = cardId !== undefined ? getLoveLetterCard(cardId) : null;
  const className = `group relative overflow-hidden rounded-[1.6rem] border text-left transition ${compact ? featured ? "w-[118px] p-2.5" : "w-[104px] p-2" : "w-full p-3"
    } ${hidden
      ? "border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]"
      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]"
    } ${selected
      ? "border-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.55),0_0_36px_rgba(255,255,255,0.12)]"
      : emphasis
        ? "border-amber-200/60 shadow-[0_0_32px_rgba(251,191,36,0.15)]"
        : "border-white/10"
    } ${onClick && !disabled ? "hover:-translate-y-1 hover:border-white/55" : ""
    } ${disabled ? "cursor-not-allowed opacity-45" : ""}`;

  const content = !hidden && definition ? (
    <>
      {!imageOnly && <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${definition.accentClassName}`} />}
      <div
        className={`relative overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/35 ${compact
          ? featured
            ? "h-28"
            : "h-24"
          : imageOnly
            ? "aspect-[3/4]"
            : "h-36"
          }`}
      >
        <Image
          src={definition.imageSrc}
          alt={definition.name}
          fill
          className="object-contain p-2 transition duration-300 group-hover:scale-[1.03]"
        />
        {!imageOnly && (
          <>
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#14090f] via-[#14090f]/70 to-transparent" />
            <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-xs font-black text-white">
              {definition.id}
            </div>
          </>
        )}
      </div>
      {!imageOnly && (
        <div className={compact ? "mt-2.5" : "mt-3"}>
          <p className={`font-bold uppercase tracking-[0.3em] text-[#f6ddd6]/65 ${compact ? featured ? "text-xs" : "text-[11px]" : "text-[11px] md:text-xs"}`}>
            {definition.englishName}
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className={`${compact ? featured ? "text-[15px]" : "text-sm" : "text-lg"} font-black text-white`}>
              {definition.name}
            </p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/70">
              x{definition.copies}
            </span>
          </div>
          <p className={`mt-2 text-white/85 ${compact ? featured ? "text-xs leading-5" : "text-[11px] leading-4" : "text-sm leading-5"}`}>
            {compact ? definition.summary : definition.effect}
          </p>
        </div>
      )}
    </>
  ) : (
    <div
      className={`flex h-full min-h-[160px] flex-col justify-between rounded-[1.25rem] border border-white/10 bg-[#211019]/70 p-4 ${compact
        ? featured
          ? "min-h-[148px]"
          : "min-h-[118px]"
        : imageOnly
          ? "min-h-[280px]"
          : ""
        }`}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-[#f8e7e2]/55">Secret</p>
        <p className="mt-3 text-xl font-black text-white">비공개 손패</p>
        <p className="mt-2 text-sm leading-5 text-white/65">관전자 모드나 결과 공개 전까지 카드 내용은 숨겨집니다.</p>
      </div>
      <div className="mt-4 rounded-[1rem] border border-dashed border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.3em] text-white/45">
        face down
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function RuleSummaryCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f6ddd6]/60">{title}</p>
      <p className="mt-3 text-sm leading-6 text-white/80">{body}</p>
    </div>
  );
}

function ActionLogPanel({ logs }: { logs: LlRoomView["logs"] }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f6ddd6]/60">Action Feed</p>
          <h3 className="mt-2 text-xl font-black text-white">최근 행동</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/65">
          {logs.length}건
        </span>
      </div>
      <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
        {logs.length > 0 ? (
          logs
            .slice()
            .reverse()
            .map((log) => (
              <div key={`${log.id}-${log.created_at}`} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white/85">{log.public_message}</span>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.25em] text-white/35">
                    {formatLlTimestamp(log.created_at)}
                  </span>
                </div>
                {(log.actor_nickname || log.target_nickname || log.card_id !== null) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
                    {log.actor_nickname && <span>{log.actor_nickname}</span>}
                    {log.card_id !== null && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        {getLoveLetterCard(log.card_id).name}
                      </span>
                    )}
                    {log.target_nickname && <span>→ {log.target_nickname}</span>}
                  </div>
                )}
              </div>
            ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/55">
            아직 공개된 행동 로그가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerSeatCard({
  player,
  isSelf,
  isHost,
  isTurnPlayer,
  isStarter,
  isProtected,
  isEliminated,
  isRoundWinner,
  isMatchWinner,
  tokenGoal,
  handCount,
  showBoardHand,
  visibleHand,
  discardPile,
  selectable,
  selected,
  onSelect,
}: {
  player: LlRoomPlayerRow;
  isSelf: boolean;
  isHost: boolean;
  isTurnPlayer: boolean;
  isStarter: boolean;
  isProtected: boolean;
  isEliminated: boolean;
  isRoundWinner: boolean;
  isMatchWinner: boolean;
  tokenGoal: number;
  handCount: number;
  showBoardHand: boolean;
  visibleHand: LlCardId[];
  discardPile: LlCardId[];
  selectable: boolean;
  selected: boolean;
  onSelect?: () => void;
}) {
  const cardClassName = `w-full rounded-[1.6rem] border p-4 text-left shadow-xl backdrop-blur-xl transition ${isEliminated
        ? "border-rose-400/20 bg-[#251015]/70 grayscale"
        : isMatchWinner
          ? "border-amber-200/65 bg-[#251712]/82 shadow-[0_0_36px_rgba(251,191,36,0.18)]"
          : isRoundWinner
            ? "border-yellow-100/60 bg-[#1f121b]/82 shadow-[0_0_28px_rgba(253,224,71,0.14)]"
            : selected
              ? "border-white/85 bg-[#26131f]/88 shadow-[0_0_28px_rgba(255,255,255,0.14)]"
              : selectable
                ? "border-cyan-100/45 bg-[#1f1320]/86 hover:-translate-y-1 hover:border-cyan-100/85"
                : "border-white/10 bg-[#1d111c]/84"
        }`;

  const cardBody = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
              {isHost ? "HOST" : `P${player.seat_index + 1}`}
            </span>
            {isStarter && (
              <span className="rounded-full border border-amber-200/30 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-amber-100">
                선 플레이어
              </span>
            )}
            {isTurnPlayer && (
              <span className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-cyan-100">
                현재 턴
              </span>
            )}
          </div>
          <p className="mt-3 truncate text-lg font-black text-white">{player.nickname_snapshot}</p>
          <p className="mt-1 text-xs text-white/55">
            {isEliminated ? "해당 라운드 탈락" : isProtected ? "보호 상태 유지 중" : "라운드 진행 중"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">Hand</p>
          <p className="mt-1 text-lg font-black text-white">{handCount}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-white/65">
        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2">
          <p className="font-bold uppercase tracking-[0.25em] text-white/40">Hand</p>
          <p className="mt-1 text-sm font-bold text-white">{handCount}장</p>
          <p className="text-[11px] text-white/45">{isSelf ? "보드는 비공개" : "남은 손패 수"}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2">
          <p className="font-bold uppercase tracking-[0.25em] text-white/40">Public</p>
          <p className="mt-1 text-sm font-bold text-white">{discardPile.length}장</p>
          <p className="text-[11px] text-white/45">합 {getLlPublicDiscardSum(discardPile)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2">
          <p className="font-bold uppercase tracking-[0.25em] text-white/40">Token</p>
          <p className="mt-1 text-sm font-bold text-white">
            {player.token_count} / {tokenGoal}
          </p>
          <p className="text-[11px] text-white/45">누적 비밀 폴라로이드</p>
        </div>
      </div>

      {showBoardHand && (
        <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">Visible Hand</p>
            <p className="text-[11px] text-white/45">
              {visibleHand.length > 0 ? `${visibleHand.length}장 공개` : `${handCount}장 보유`}
            </p>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {visibleHand.length > 0 ? (
              visibleHand.map((cardId, index) => (
                <div key={`${player.player_id}-visible-${cardId}-${index}`} className="shrink-0">
                  <LoveLetterCardFace cardId={cardId} compact />
                </div>
              ))
            ) : (
              Array.from({ length: Math.max(1, handCount || 1) }, (_, index) => (
                <div key={`${player.player_id}-hidden-${index}`} className="shrink-0">
                  <LoveLetterCardFace hidden compact />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">Public Cards</p>
            <p className="mt-1 text-sm font-black text-white">{player.nickname_snapshot}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-white">{discardPile.length}장</p>
            <p className="text-[11px] text-white/45">합 {getLlPublicDiscardSum(discardPile)}</p>
          </div>
        </div>
        <div className="mt-3">
          {discardPile.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {discardPile.map((cardId, index) => (
                <div key={`${player.player_id}-public-${cardId}-${index}`} className="shrink-0">
                  <LoveLetterCardFace cardId={cardId} compact featured />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center rounded-[1.1rem] border border-dashed border-white/10 bg-white/5 text-sm text-white/45">
              공개 카드 없음
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cardClassName}>
        {cardBody}
      </button>
    );
  }

  return <div className={cardClassName}>{cardBody}</div>;
}

function PrivateResultModal({
  result,
  onClose,
}: {
  result: LlPrivateResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  const card = result.card_id !== null && result.card_id !== undefined ? getLoveLetterCard(result.card_id) : null;
  const actorCard = result.actor_card_id !== null && result.actor_card_id !== undefined
    ? getLoveLetterCard(result.actor_card_id)
    : null;
  const targetCard = result.target_card_id !== null && result.target_card_id !== undefined
    ? getLoveLetterCard(result.target_card_id)
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#130911]/95 p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f6ddd6]/60">Private Result</p>
              <h3 className="mt-2 text-2xl font-black text-white">{result.title || "비공개 결과"}</h3>
              {result.message && <p className="mt-3 text-sm leading-6 text-white/75">{result.message}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-3 py-1 text-sm font-bold text-white/80"
            >
              닫기
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {card && <LoveLetterCardFace cardId={card.id} />}
            {actorCard && <LoveLetterCardFace cardId={actorCard.id} />}
            {targetCard && <LoveLetterCardFace cardId={targetCard.id} />}
            {result.options && result.options.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-3 text-sm font-bold text-white/75">확인한 카드</p>
                <div className="flex flex-wrap gap-3">
                  {result.options.map((optionCardId, index) => (
                    <div key={`${optionCardId}-${index}`} className="w-[110px]">
                      <LoveLetterCardFace cardId={optionCardId} compact />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function LeaveConfirmModal({
  playing,
  onConfirm,
  onCancel,
}: {
  playing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#130911]/95 p-6 shadow-2xl"
        >
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f6ddd6]/60">
            {playing ? "Forfeit" : "Leave Room"}
          </p>
          <h3 className="mt-2 text-2xl font-black text-white">{playing ? "기권 후 나가기" : "Room 나가기"}</h3>
          <p className="mt-4 text-sm leading-6 text-white/75">
            {playing
              ? "지금 나가면 즉시 기권 처리되고 남아 있는 플레이어 승리로 게임이 종료됩니다."
              : "현재 Room을 나가면 참가자 목록에서 빠집니다."}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/80"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-[#dc5c57] px-4 py-2 text-sm font-black text-white"
            >
              {playing ? "기권 후 나가기" : "Room 나가기"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function BroadcasterModal({
  options,
  keptCardId,
  bottomOrder,
  onPickKept,
  onMove,
  onSubmit,
  onClose,
  loading,
}: {
  options: LlCardId[];
  keptCardId: LlCardId | null;
  bottomOrder: LlCardId[];
  onPickKept: (cardId: LlCardId) => void;
  onMove: (index: number, direction: "left" | "right") => void;
  onSubmit: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] overflow-y-auto bg-black/70 p-3 sm:p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="mx-auto my-4 w-full max-w-4xl rounded-[2rem] border border-white/10 bg-[#130911]/95 p-4 shadow-2xl sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f6ddd6]/60">Broadcaster</p>
              <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">남길 카드와 덱 아래 순서를 선택하세요</h3>
              <p className="mt-3 text-sm leading-6 text-white/75">
                남길 카드 1장을 먼저 고르고, 나머지 카드는 고르는 순서대로 덱 맨 아래로 들어갑니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 self-end rounded-full border border-white/10 px-3 py-1 text-sm font-bold text-white/80 sm:self-auto"
            >
              닫기
            </button>
          </div>

          <div className="mt-6 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
            {options.map((cardId, index) => (
              <div key={`${cardId}-${index}`} className="w-[min(220px,72vw)] shrink-0 sm:w-auto">
                <LoveLetterCardFace
                  cardId={cardId}
                  imageOnly
                  selected={keptCardId === cardId}
                  onClick={() => onPickKept(cardId)}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f6ddd6]/60">Bottom Order</p>
                <p className="mt-2 text-sm text-white/70">왼쪽에서 오른쪽 순서대로 먼저 내려갑니다.</p>
              </div>
              <button
                type="button"
                disabled={loading || keptCardId === null}
                onClick={onSubmit}
                className="rounded-full bg-[#d95b5f] px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                선택 확정
              </button>
            </div>
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {bottomOrder.map((cardId, index) => (
                <div key={`${cardId}-${index}`} className="shrink-0 rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
                  <div className="w-[118px]">
                    <LoveLetterCardFace cardId={cardId} compact featured imageOnly />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMove(index, "left")}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/75 disabled:opacity-30"
                    >
                      ◀️
                    </button>
                    <button
                      type="button"
                      disabled={index === bottomOrder.length - 1}
                      onClick={() => onMove(index, "right")}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/75 disabled:opacity-30"
                    >
                      ▶️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function FinalVerdictOverlay({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="flex gap-1 text-5xl font-black tracking-wider text-amber-100 md:text-7xl">
        {text.split("").map((char, index) => (
          <motion.span
            key={`${char}-${index}`}
            initial={{ opacity: 0, y: 26, rotateX: -90, scale: 0.72 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{ duration: 0.24, delay: index * 0.05 }}
          >
            {char}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

function getRoomIdFromRpcPayload(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.room_id === "string") return row.room_id;
  if (typeof row.id === "string") return row.id;
  if (row.room && typeof row.room === "object" && row.room && !Array.isArray(row.room)) {
    const room = row.room as Record<string, unknown>;
    if (typeof room.id === "string") return room.id;
  }
  return null;
}

function swapArrayEntries<T>(items: T[], leftIndex: number, rightIndex: number): T[] {
  const next = items.slice();
  const temp = next[leftIndex];
  next[leftIndex] = next[rightIndex];
  next[rightIndex] = temp;
  return next;
}

function getRoleLabel(player: LlRoomPlayerRow, room: LlRoomRow | null): string {
  if (!room) return `PLAYER ${player.seat_index + 1}`;
  return room.host_id === player.player_id ? "호스트" : `플레이어 ${player.seat_index + 1}`;
}

function getCardSelectionGuide(
  card: LlCardDefinition | null,
  targetIds: string[],
  selectedTargetId: string | null
): string {
  if (!card) return "공개할 카드를 선택하세요.";
  if (card.id === 1) {
    if (targetIds.length === 0) return "지목 가능한 상대가 없어 효과 없이 공개됩니다.";
    if (!selectedTargetId) return "지목할 상대를 먼저 선택하세요.";
    return "이제 추측할 카드 이름을 선택하세요.";
  }
  if ((card.id === 2 || card.id === 3 || card.id === 7) && targetIds.length > 0) {
    return selectedTargetId ? "선택을 확정해 카드를 공개하세요." : "대상을 먼저 선택하세요.";
  }
  if (card.id === 5) {
    return selectedTargetId ? "강제 버림 대상을 확정해 카드를 공개하세요." : "자신 포함 한 명을 선택하세요.";
  }
  if (card.id === 6) return "공개 후 3장 중 1장을 고르는 전용 모달이 열립니다.";
  if (card.id === 9) return "짝사랑은 공개되는 즉시 탈락합니다.";
  return "선택을 확정해 카드를 공개하세요.";
}

function getLoveLetterLobbyStateText(player: LlRoomPlayerRow): string {
  return player.ready ? "상태 준비 완료" : "상태 미준비";
}

export function LoveLetterOnline({ entryHref = "/" }: { entryHref?: string }) {
  const {
    userId,
    nickname: authNickname,
    requiresNickname,
    isLoading: authLoading,
    profileLoading,
  } = useAuth();

  const [room, setRoom] = useState<LlRoomRow | null>(null);
  const [players, setPlayers] = useState<LlRoomPlayerRow[]>([]);
  const [view, setView] = useState<LlRoomView | null>(null);
  const [record, setRecord] = useState<PlayerRecord>(EMPTY_RECORD);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [selectedPlayerLimit, setSelectedPlayerLimit] = useState<LlPlayerLimit | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<LlCardId | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedGuessId, setSelectedGuessId] = useState<LlCardId | null>(null);
  const [broadcasterKeptCardId, setBroadcasterKeptCardId] = useState<LlCardId | null>(null);
  const [broadcasterBottomOrder, setBroadcasterBottomOrder] = useState<LlCardId[]>([]);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [privateResult, setPrivateResult] = useState<LlPrivateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showVerdict, setShowVerdict] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);

  const roomRef = useRef<LlRoomRow | null>(null);
  const userIdRef = useRef<string | null>(null);
  const previousFinishedRef = useRef(false);
  const previousEliminatedRef = useRef(false);
  const heartbeatErrorShownRef = useRef(false);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activePlayers = useMemo(
    () => players.filter((player) => !player.left_at).sort((left, right) => left.seat_index - right.seat_index),
    [players]
  );
  const playerMap = useMemo(
    () => Object.fromEntries(activePlayers.map((player) => [player.player_id, player])),
    [activePlayers]
  );
  const protectedSet = useMemo(() => new Set(view?.protected_player_ids ?? []), [view]);
  const eliminatedSet = useMemo(() => new Set(view?.eliminated_player_ids ?? []), [view]);
  const roundWinnerSet = useMemo(() => new Set(view?.round_winner_ids ?? []), [view]);
  const matchWinnerSet = useMemo(
    () => new Set(room?.final_winner_ids.length ? room.final_winner_ids : view?.match_winner_ids ?? []),
    [room, view]
  );

  const myPlayer = userId ? playerMap[userId] ?? null : null;
  const roomFinished = room?.status === "finished";
  const isHost = Boolean(userId && room && room.host_id === userId);
  const myTurn = Boolean(userId && view && view.round_phase === "await_turn" && view.current_turn_player_id === userId);
  const myHand = view?.my_hand ?? [];
  const canSeeAllHands = Boolean(view?.reveal_all_hands || view?.spectator_mode);
  const tokenGoal = room?.target_token_count ?? getLoveLetterTokenGoal(room?.player_limit);
  const seatPlacements = useMemo(() => getLlSeatPlacements(activePlayers, userId), [activePlayers, userId]);
  const validTargetIds = useMemo(() => {
    if (!selectedCardId) return [];
    if (view?.pending_input.valid_target_ids.length) {
      return view.pending_input.valid_target_ids;
    }
    return getLlDefaultValidTargetIds(
      selectedCardId,
      userId,
      activePlayers,
      view?.protected_player_ids ?? [],
      view?.eliminated_player_ids ?? []
    );
  }, [activePlayers, selectedCardId, userId, view]);
  const guessableCards = useMemo(
    () => (view?.pending_input.valid_guess_card_ids.length ? view.pending_input.valid_guess_card_ids : getLoveLetterGuessableCards()),
    [view]
  );
  const selectedCard = selectedCardId !== null ? getLoveLetterCard(selectedCardId) : null;
  const needsTarget = Boolean(selectedCard && validTargetIds.length > 0 && selectedCard.targetMode !== "none");
  const needsGuess = selectedCardId === 1 && validTargetIds.length > 0;
  const canConfirmPlay = Boolean(
    myTurn &&
    selectedCardId !== null &&
    (!needsTarget || selectedTargetId) &&
    (!needsGuess || selectedGuessId !== null)
  );
  const pendingBroadcaster = Boolean(
    userId &&
    view &&
    view.round_phase === "await_broadcaster_resolution" &&
    view.current_turn_player_id === userId &&
    view.pending_input.broadcaster_options.length > 0
  );
  const canAdvanceRound = Boolean(
    isHost &&
    room?.status === "playing" &&
    view?.round_phase === "await_next_round" &&
    room.final_winner_ids.length === 0 &&
    view.match_winner_ids.length === 0
  );
  const canResetToLobby = Boolean(isHost && roomFinished && !(room?.last_departed_nickname || view?.end_reason === "player_left"));
  const hostCanStart = Boolean(
    room?.status === "waiting" &&
    isHost &&
    activePlayers.length === room.player_limit &&
    activePlayers.every((player) => player.ready)
  );
  const centerNoteTitle = !view
    ? ""
    : view.round_phase === "await_next_round"
      ? view.round_winner_ids.length > 1
        ? "공동 라운드 승리"
        : "라운드 결과 공개"
      : view.round_phase === "match_finished"
        ? "매치 결과 확정"
      : view.round_phase === "await_broadcaster_resolution" && view.current_turn_player_id === userId
        ? "방송부장 정리"
      : view.current_turn_player_id
        ? `${playerMap[view.current_turn_player_id]?.nickname_snapshot ?? "플레이어"} 차례`
      : "진행 상황";

  useEffect(() => {
    if (!selectedCardId) {
      setSelectedTargetId(null);
      setSelectedGuessId(null);
      return;
    }
    if (selectedTargetId && !validTargetIds.includes(selectedTargetId)) {
      setSelectedTargetId(null);
    }
    if (!selectedTargetId && validTargetIds.length === 1) {
      setSelectedTargetId(validTargetIds[0]);
    }
    if (selectedCardId !== 1) {
      setSelectedGuessId(null);
    }
  }, [selectedCardId, selectedTargetId, validTargetIds]);

  useEffect(() => {
    if (!pendingBroadcaster || !view) {
      setBroadcasterKeptCardId(null);
      setBroadcasterBottomOrder([]);
      return;
    }
    const [first, ...rest] = view.pending_input.broadcaster_options;
    setBroadcasterKeptCardId(first ?? null);
    setBroadcasterBottomOrder(rest);
  }, [pendingBroadcaster, view]);

  useEffect(() => {
    if (!userId || !view) return;
    const currentlyEliminated = eliminatedSet.has(userId);
    if (currentlyEliminated && !previousEliminatedRef.current) {
      setNotice("해당 라운드에서 탈락되었습니다. 관전자 모드가 실행됩니다.");
    }
    previousEliminatedRef.current = currentlyEliminated;
  }, [eliminatedSet, userId, view]);

  useEffect(() => {
    if (!roomFinished) {
      previousFinishedRef.current = false;
      setShowVerdict(false);
      return;
    }

    if (previousFinishedRef.current) return;
    previousFinishedRef.current = true;
    setShowVerdict(true);
    const timer = window.setTimeout(() => setShowVerdict(false), 2600);
    return () => window.clearTimeout(timer);
  }, [roomFinished]);

  const clearRoomScopedState = useCallback(() => {
    setRoom(null);
    setPlayers([]);
    setView(null);
    setSelectedCardId(null);
    setSelectedTargetId(null);
    setSelectedGuessId(null);
    setBroadcasterKeptCardId(null);
    setBroadcasterBottomOrder([]);
    setPrivateResult(null);
    setLeaveConfirmOpen(false);
  }, []);

  const loadMyRecord = useCallback(async (currentUserId: string) => {
    if (!supabase) return;

    const { data, error: recordError } = await supabase
      .from("ll_player_stats")
      .select("matches_played,match_wins,round_wins")
      .eq("player_id", currentUserId)
      .maybeSingle();

    if (recordError) {
      setRecord(EMPTY_RECORD);
      return;
    }

    setRecord({
      matches: typeof data?.matches_played === "number" ? data.matches_played : 0,
      matchWins: typeof data?.match_wins === "number" ? data.match_wins : 0,
      roundWins: typeof data?.round_wins === "number" ? data.round_wins : 0,
    });
  }, []);

  const syncRoomBundle = useCallback(async (roomId: string, options?: { silent?: boolean }) => {
    if (!supabase || !roomId) return;

    const [roomResponse, playersResponse, viewResponse] = await Promise.all([
      supabase
        .from("ll_rooms")
        .select("id,room_code,host_id,player_limit,status,current_round,target_token_count,final_winner_ids,last_departed_nickname,updated_at")
        .eq("id", roomId)
        .maybeSingle(),
      supabase
        .from("ll_room_players")
        .select("room_id,player_id,seat_index,join_order,ready,token_count,nickname_snapshot,left_at,last_active_at,joined_at")
        .eq("room_id", roomId)
        .order("join_order", { ascending: true }),
      supabase.rpc("ll_get_room_view", {
        p_room_id: roomId,
      }),
    ]);

    if (roomResponse.error) {
      if (!options?.silent) {
        setError(formatLoveLetterError(roomResponse.error.message, roomResponse.error.code));
      }
      return;
    }

    const nextRoom = normalizeLlRoomRow(roomResponse.data);
    if (!nextRoom) {
      clearRoomScopedState();
      return;
    }

    setRoom(nextRoom);

    if (playersResponse.error) {
      if (!options?.silent) {
        setError(formatLoveLetterError(playersResponse.error.message, playersResponse.error.code));
      }
    } else {
      setPlayers(normalizeLlRoomPlayers(playersResponse.data));
    }

    if (viewResponse.error) {
      if (nextRoom.status === "playing" && !options?.silent) {
        setError(formatLoveLetterError(viewResponse.error.message, viewResponse.error.code));
      }
      setView((current) => (current?.room_id === roomId ? current : null));
      return;
    }

    const envelope = resolveLlRpcEnvelope(viewResponse.data);
    setView(envelope.view ?? normalizeLlRoomView(viewResponse.data));
  }, [clearRoomScopedState]);

  const syncAfterRpcMutation = useCallback(async (payload: unknown, fallbackRoomId?: string | null) => {
    const envelope = resolveLlRpcEnvelope(payload);
    if (envelope.privateResult) {
      setPrivateResult(envelope.privateResult);
    }
    if (envelope.view) {
      setView(envelope.view);
    }
    if (envelope.room) {
      setRoom(envelope.room);
    }

    const roomId = envelope.room?.id ?? getRoomIdFromRpcPayload(payload) ?? fallbackRoomId ?? roomRef.current?.id ?? null;
    if (roomId) {
      await syncRoomBundle(roomId, { silent: true });
    }
  }, [syncRoomBundle]);

  useEffect(() => {
    if (!supabase || authLoading || profileLoading || !userId || requiresNickname) return;

    void loadMyRecord(userId);

    supabase
      .from("ll_room_players")
      .select("room_id,left_at,joined_at")
      .eq("player_id", userId)
      .is("left_at", null)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: membershipError }) => {
        if (membershipError || !data?.room_id) return;
        void syncRoomBundle(data.room_id, { silent: true });
      });
  }, [authLoading, loadMyRecord, profileLoading, requiresNickname, syncRoomBundle, userId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !room?.id) return;

    const channel = client
      .channel(`love-letter-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ll_rooms", filter: `id=eq.${room.id}` },
        () => {
          void syncRoomBundle(room.id, { silent: true });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ll_room_players", filter: `room_id=eq.${room.id}` },
        () => {
          void syncRoomBundle(room.id, { silent: true });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ll_round_states", filter: `room_id=eq.${room.id}` },
        () => {
          void syncRoomBundle(room.id, { silent: true });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ll_action_logs", filter: `room_id=eq.${room.id}` },
        () => {
          void syncRoomBundle(room.id, { silent: true });
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [room?.id, syncRoomBundle]);

  useEffect(() => {
    if (!supabase || !room?.id || !isPageVisible) return;

    const interval = window.setInterval(() => {
      void syncRoomBundle(room.id, { silent: true });
    }, 4000);

    return () => window.clearInterval(interval);
  }, [isPageVisible, room?.id, syncRoomBundle]);

  useEffect(() => {
    const client = supabase;
    if (!client || !room?.id || room.status !== "playing" || !userId) return;

    const touch = () => {
      client
        .rpc("ll_touch_player_activity", {
          p_room_id: room.id,
        })
        .then(({ error: touchError }) => {
          if (!touchError) return;
          if (heartbeatErrorShownRef.current) return;
          heartbeatErrorShownRef.current = true;
          setError(formatLoveLetterError(touchError.message, touchError.code));
        });
    };

    touch();
    const interval = window.setInterval(touch, 45000);
    return () => window.clearInterval(interval);
  }, [room?.id, room?.status, userId]);

  const createRoom = async () => {
    if (!supabase) return;
    if (!selectedPlayerLimit) {
      setError("방 인원을 먼저 선택해 주세요.");
      return;
    }

    const nickname = authNickname.trim();
    if (!nickname) {
      setError("닉네임이 필요합니다. 랜딩 페이지에서 먼저 설정해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    const { data, error: createError } = await supabase.rpc("ll_create_room", {
      p_player_limit: selectedPlayerLimit,
      p_nickname_snapshot: nickname,
    });

    if (createError) {
      setError(formatLoveLetterError(createError.message, createError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data);
    setNotice(`${selectedPlayerLimit}인 Room이 생성되었습니다.`);
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!supabase) return;
    const nickname = authNickname.trim();
    if (!nickname) {
      setError("닉네임이 필요합니다. 랜딩 페이지에서 먼저 설정해 주세요.");
      return;
    }
    if (roomCodeInput.trim().length !== 6) {
      setError("6자리 방 코드를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    const { data, error: joinError } = await supabase.rpc("ll_join_room", {
      p_room_code: roomCodeInput.trim().toUpperCase(),
      p_nickname_snapshot: nickname,
    });

    if (joinError) {
      setError(formatLoveLetterError(joinError.message, joinError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data);
    setNotice("Room에 입장했습니다.");
    setLoading(false);
  };

  const setPlayerReady = async (ready: boolean) => {
    if (!supabase || !room) return;
    setLoading(true);
    setError("");

    const { data, error: readyError } = await supabase.rpc("ll_set_player_ready", {
      p_room_id: room.id,
      p_ready: ready,
    });

    if (readyError) {
      setError(formatLoveLetterError(readyError.message, readyError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data, room.id);
    setNotice(ready ? "준비 완료" : "준비 취소");
    setLoading(false);
  };

  const startMatch = async () => {
    if (!supabase || !room) return;
    setLoading(true);
    setError("");

    const { data, error: startError } = await supabase.rpc("ll_start_match", {
      p_room_id: room.id,
    });

    if (startError) {
      setError(formatLoveLetterError(startError.message, startError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data, room.id);
    setNotice("매치가 시작되었습니다.");
    setLoading(false);
  };

  const playSelectedCard = async () => {
    if (!supabase || !room || selectedCardId === null || !canConfirmPlay) return;

    setLoading(true);
    setError("");
    setPrivateResult(null);

    const { data, error: playError } = await supabase.rpc("ll_play_card", {
      p_room_id: room.id,
      p_played_card: selectedCardId,
      p_target_player_id: selectedTargetId,
      p_guessed_card: selectedGuessId,
    });

    if (playError) {
      setError(formatLoveLetterError(playError.message, playError.code));
      setLoading(false);
      return;
    }

    setSelectedCardId(null);
    setSelectedTargetId(null);
    setSelectedGuessId(null);
    await syncAfterRpcMutation(data, room.id);
    setLoading(false);
  };

  const resolveBroadcaster = async () => {
    if (!supabase || !room || broadcasterKeptCardId === null) return;

    setLoading(true);
    setError("");
    setPrivateResult(null);

    const { data, error: resolveError } = await supabase.rpc("ll_resolve_broadcaster", {
      p_room_id: room.id,
      p_kept_card: broadcasterKeptCardId,
      p_bottom_order: broadcasterBottomOrder,
    });

    if (resolveError) {
      setError(formatLoveLetterError(resolveError.message, resolveError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data, room.id);
    setLoading(false);
  };

  const advanceToNextRound = async () => {
    if (!supabase || !room) return;

    setLoading(true);
    setError("");

    const { data, error: advanceError } = await supabase.rpc("ll_advance_to_next_round", {
      p_room_id: room.id,
    });

    if (advanceError) {
      setError(formatLoveLetterError(advanceError.message, advanceError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data, room.id);
    setNotice("다음 라운드를 시작합니다.");
    setLoading(false);
  };

  const resetRoom = async () => {
    if (!supabase || !room) return;

    setLoading(true);
    setError("");

    const { data, error: resetError } = await supabase.rpc("ll_reset_room", {
      p_room_id: room.id,
    });

    if (resetError) {
      setError(formatLoveLetterError(resetError.message, resetError.code));
      setLoading(false);
      return;
    }

    await syncAfterRpcMutation(data, room.id);
    setNotice("Room으로 복귀했습니다.");
    setLoading(false);
  };

  const leaveRoom = async () => {
    if (!supabase || !room) return;

    const wasPlaying = room.status === "playing";

    setLoading(true);
    setError("");
    setNotice("");

    const { error: leaveError } = await supabase.rpc("ll_leave_room", {
      p_room_id: room.id,
    });

    if (leaveError) {
      setError(formatLoveLetterError(leaveError.message, leaveError.code));
      setLoading(false);
      return;
    }

    if (userId) {
      await loadMyRecord(userId);
    }
    clearRoomScopedState();
    setNotice(wasPlaying ? "게임에서 나가 기권 처리되었습니다." : "Room에서 나갔습니다.");
    setLoading(false);
  };

  const copyRoomCode = async () => {
    if (!room) return;

    try {
      await navigator.clipboard.writeText(room.room_code);
      setNotice("방 코드를 복사했습니다.");
    } catch {
      setNotice(`방 코드: ${room.room_code}`);
    }
  };

  if (!supabase) {
    return <div className="p-6 text-red-200">Supabase 설정이 없어 러브레터를 실행할 수 없습니다.</div>;
  }

  const verdictText = matchWinnerSet.size > 0
    ? userId && matchWinnerSet.has(userId)
      ? "승리!"
      : "패배..."
    : "게임 종료";

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-white md:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,224,193,0.1),transparent_34%),linear-gradient(180deg,#120713_0%,#1c0d1f_50%,#140811_100%)]" />
      <div className="pointer-events-none absolute -left-10 top-14 h-56 w-56 rounded-full bg-[#ffd3aa]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-16 right-0 h-72 w-72 rounded-full bg-[#8a234a]/15 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#3a1236]/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-7xl">
        <header className="rounded-[2rem] border border-[#ffd5cc]/10 bg-[#150811]/75 p-5 shadow-[0_30px_80px_rgba(26,7,17,0.48)] backdrop-blur-xl md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.42em] text-[#f7d9d1]/65">Love Letter</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">러브 레터</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 md:text-base">
                누가 짝사랑의 곁에 있는지, 눈빛 하나로 추리하는 1분간의 사투.
                <br />
                21장의 카드 속, 공주에게 닿을 유일한 승자는 누구인가.
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-[#ffd5cc]/10 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f7d9d1]/65">My Record</p>
              <p className="mt-2 text-lg font-bold text-white">{authNickname || "플레이어"}</p>
              <p className="mt-2 text-sm text-[#f8e6e2]/75">
                {record.matches > 0
                  ? `${record.matches}매치 ${record.matchWins}승 ${record.matches - record.matchWins}패 · 라운드 ${record.roundWins}승`
                  : "전적 없음"}
              </p>
              <Link
                href={entryHref}
                className="mt-4 inline-flex rounded-full border border-[#ffd5cc]/20 px-4 py-2 text-sm font-bold text-[#fff1ee]/90 transition hover:bg-white/5"
              >
                BoardHub
              </Link>
            </div>
          </div>
        </header>

        {authLoading || profileLoading ? (
          <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-black/20 p-5 text-sm text-white/70 backdrop-blur-xl">
            로그인 상태와 닉네임을 확인하는 중입니다.
          </div>
        ) : requiresNickname ? (
          <div className="mt-6 rounded-[1.75rem] border border-amber-200/15 bg-amber-200/8 p-5 text-sm text-amber-50/90 backdrop-blur-xl">
            닉네임이 필요합니다. 랜딩에서 닉네임을 먼저 설정한 뒤 다시 입장해 주세요.
          </div>
        ) : null}

        {error && (
          <div className="mt-6 rounded-[1.75rem] border border-[#ff9d8f]/20 bg-[#49171d]/60 p-4 text-sm text-[#ffe1dd]">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-4 rounded-[1.75rem] border border-cyan-200/15 bg-cyan-200/8 p-4 text-sm text-cyan-50/90">
            {notice}
          </div>
        )}

        {!room ? (
          <>
            <section className="mt-6 rounded-2xl border border-[#ffd5cc]/20 bg-black/45 p-5 backdrop-blur-md">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Room Lobby</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#ffd5cc]/20 bg-black/35 p-4">
                  <p className="text-sm text-[#f8e6e2]/70">방 인원 선택 후 생성</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LOVE_LETTER_PLAYER_LIMITS.map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        onClick={() => setSelectedPlayerLimit(limit)}
                        className={`rounded-lg px-4 py-2 text-sm font-bold transition ${selectedPlayerLimit === limit
                          ? "bg-[#f8e6e2] text-[#250e1c]"
                          : "border border-[#ffd5cc]/20 bg-black/30 text-white/85 hover:bg-white/10"
                          }`}
                      >
                        {limit}인
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void createRoom()}
                    disabled={!selectedPlayerLimit || loading || authLoading || profileLoading}
                    className="mt-4 w-full rounded-xl bg-[#d95b5f] px-4 py-3 text-lg font-bold text-white disabled:opacity-45"
                  >
                    방 만들기
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    placeholder="방 코드 6자리"
                    maxLength={6}
                    className="w-full rounded-lg border border-[#ffd5cc]/20 bg-black/35 px-3 py-2 uppercase tracking-[0.2em] text-white outline-none placeholder:text-white/25"
                  />
                  <button
                    type="button"
                    onClick={() => void joinRoom()}
                    disabled={loading || authLoading || profileLoading}
                    className="rounded-lg bg-[#d95b5f] px-4 py-2 font-bold text-white disabled:opacity-45"
                  >
                    입장
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-6">
              <div className="grid gap-4 lg:grid-cols-4">
                {LOVE_LETTER_RULE_SUMMARY.map((item) => (
                  <RuleSummaryCard key={item.title} title={item.title} body={item.body} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="mt-6 rounded-2xl border border-[#ffd5cc]/20 bg-black/45 p-5 backdrop-blur-md">
              <div className={`flex flex-wrap items-start gap-4 ${room.status === "waiting" ? "justify-between" : "justify-end"}`}>
                {room.status === "waiting" ? (
                  <div>
                    <p className="text-sm text-[#f8e6e2]/70">ROOM CODE</p>
                    <div className="mt-2 flex items-center gap-3">
                      <p className="text-2xl font-black tracking-[0.2em] text-[#fff1ee]">{room.room_code}</p>
                      <button
                        type="button"
                        onClick={() => void copyRoomCode()}
                        className="rounded-lg border border-[#ffd5cc]/20 px-3 py-1 text-xs font-bold text-[#fff1ee]/85 transition hover:bg-white/5"
                      >
                        복사
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-full px-3 py-1 text-xs font-bold text-white/80">
                    러브레터 {room.player_limit}인 매치
                  </div>
                )}

                {room.status === "waiting" ? (
                  <div className="text-right">
                    <p className="text-sm text-[#f8e6e2]/70">STATUS</p>
                    <p className="font-bold uppercase text-white">{room.status}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full px-3 py-1 text-xs font-bold ${getLoveLetterStatusChipClass(room.status)}`}>
                      {getLoveLetterStatusLabel(room.status)}
                    </div>
                    {view && room.status === "playing" && (
                      <div className="rounded-full border border-[#ffd5cc]/20 px-3 py-1 text-xs font-bold text-white/80">
                        {getLoveLetterPhaseLabel(view.round_phase)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className={`mt-5 grid gap-3 ${activePlayers.length <= 2
                  ? "md:grid-cols-2"
                  : activePlayers.length === 3
                    ? "md:grid-cols-3"
                    : "md:grid-cols-2 xl:grid-cols-4"
                  }`}
              >
                {room.status === "waiting"
                  ? activePlayers.map((player) => (
                    <LoveLetterRoomPlayerCard
                      key={player.player_id}
                      title={getRoleLabel(player, room)}
                      name={player.nickname_snapshot}
                      stateText={getLoveLetterLobbyStateText(player)}
                      tokenText={`비밀 폴라로이드 ${player.token_count} / ${tokenGoal}`}
                      emphasized={player.player_id === userId || room.status === "waiting"}
                    />
                  ))
                  : activePlayers.map((player) => (
                    <PlayerTokenTrackCard
                      key={`${player.player_id}-track`}
                      name={player.nickname_snapshot}
                      count={player.token_count}
                      goal={tokenGoal}
                      emphasized={player.player_id === userId}
                      champion={matchWinnerSet.has(player.player_id)}
                    />
                  ))}
              </div>

              {room.status === "waiting" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {myPlayer && (
                    <button
                      type="button"
                      onClick={() => void setPlayerReady(!myPlayer.ready)}
                      disabled={loading}
                      className="rounded-lg bg-emerald-400 px-4 py-2 font-bold text-black disabled:opacity-60"
                    >
                      {myPlayer.ready ? "준비 취소" : "준비"}
                    </button>
                  )}
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => void startMatch()}
                      disabled={!hostCanStart || loading}
                      className="rounded-lg bg-[#d95b5f] px-4 py-2 font-bold text-white disabled:opacity-40"
                    >
                      게임 시작
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLeaveConfirmOpen(true)}
                    disabled={loading}
                    className="rounded-lg border border-[#ffd5cc]/30 px-4 py-2 text-white"
                  >
                    Room 나가기
                  </button>
                </div>
              )}
            </section>

            {room.status === "playing" && view && (
              <>
                <section className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
                  <div className="space-y-4">
                    <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
                      <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/60">Round Status</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <RoundMetric label="Round" value={`${view.round_number} 라운드`} />
                        <RoundMetric
                          label="Current Turn"
                          value={view.current_turn_player_id ? playerMap[view.current_turn_player_id]?.nickname_snapshot ?? "대기 중" : "대기 중"}
                        />
                        <RoundMetric
                          label="Starter"
                          value={view.starter_player_id ? playerMap[view.starter_player_id]?.nickname_snapshot ?? "미정" : "미정"}
                        />
                        <RoundMetric label="Deck" value={`${view.deck_count}장 남음`} />
                      </div>

                      {(view.round_phase === "await_next_round" || view.round_phase === "match_finished") && (
                        <div className="mt-4 rounded-[1.3rem] border border-amber-200/15 bg-amber-200/8 p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-50/75">Round Reveal</p>
                          <p className="mt-2 text-lg font-black text-white">
                            {view.round_winner_ids.length > 1 ? "공동 라운드 승리" : "라운드 승자 확정"}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white/75">
                            {view.round_winner_ids.length > 0
                              ? view.round_winner_ids
                                .map((winnerId) => playerMap[winnerId]?.nickname_snapshot ?? "플레이어")
                                .join(", ")
                              : "라운드 승자 정보 없음"}
                          </p>
                          <p className="mt-2 text-xs text-white/55">
                            {getLlRoundEndReasonLabel(view.end_reason)}
                          </p>
                          {Object.keys(view.tiebreak_sums).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {Object.entries(view.tiebreak_sums).map(([playerId, sum]) => (
                                <span
                                  key={`${playerId}-sum`}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                                >
                                  {(playerMap[playerId]?.nickname_snapshot ?? "플레이어")} 공개 카드 합 {sum}
                                </span>
                              ))}
                            </div>
                          )}
                          {canAdvanceRound && (
                            <button
                              type="button"
                              onClick={() => void advanceToNextRound()}
                              disabled={loading}
                              className="mt-4 rounded-full bg-[#d95b5f] px-4 py-2 text-sm font-black text-white disabled:opacity-45"
                            >
                              다음 라운드
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <ActionLogPanel logs={view.logs} />
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
                      <div className="relative h-[700px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_25%),linear-gradient(180deg,rgba(46,14,33,0.85),rgba(20,8,17,0.92))]">
                        <div className="absolute inset-6 rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,235,215,0.06),transparent_42%),linear-gradient(180deg,rgba(18,9,17,0.15),rgba(18,9,17,0.05))]" />

                        <div className="absolute left-1/2 top-1/2 z-20 w-[min(280px,66vw)] -translate-x-1/2 -translate-y-1/2 rounded-[1.6rem] border border-white/10 bg-[#1b0f19]/88 p-5 text-center shadow-[0_24px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/60">Center Note</p>
                          <h3 className="mt-3 text-2xl font-black text-white">{centerNoteTitle}</h3>
                          <p className="mt-3 text-sm leading-6 text-white/75">{getLlTurnNotice(view, userId)}</p>
                          {view.recent_private_message && <p className="mt-3 text-xs text-white/55">{view.recent_private_message}</p>}
                        </div>

                        {seatPlacements.map((placement) => {
                          const player = playerMap[placement.playerId];
                          if (!player) return null;
                          const isSelf = placement.isSelf;
                          const visibleHand = getLlVisibleHand(view, player.player_id, isSelf);
                          const handCount = isSelf ? myHand.length : getLlCurrentHandCount(view, player.player_id);
                          const discardPile = view.discard_piles[player.player_id] ?? [];
                          const selectable = Boolean(
                            myTurn &&
                            selectedCard &&
                            validTargetIds.includes(player.player_id) &&
                            player.player_id !== userId
                          );

                          return (
                            <div
                              key={player.player_id}
                              className={`absolute z-10 ${isSelf ? "w-[min(340px,86vw)]" : "w-[min(300px,78vw)]"}`}
                              style={placement.style}
                            >
                              <PlayerSeatCard
                                player={player}
                                isSelf={isSelf}
                                isHost={room.host_id === player.player_id}
                                isTurnPlayer={view.current_turn_player_id === player.player_id}
                                isStarter={view.starter_player_id === player.player_id}
                                isProtected={protectedSet.has(player.player_id)}
                                isEliminated={eliminatedSet.has(player.player_id)}
                                isRoundWinner={roundWinnerSet.has(player.player_id)}
                                isMatchWinner={matchWinnerSet.has(player.player_id)}
                                tokenGoal={tokenGoal}
                                handCount={handCount}
                                showBoardHand={canSeeAllHands && !isSelf}
                                visibleHand={canSeeAllHands && !isSelf ? visibleHand : []}
                                discardPile={discardPile}
                                selectable={selectable}
                                selected={selectedTargetId === player.player_id}
                                onSelect={selectable ? () => setSelectedTargetId(player.player_id) : undefined}
                              />
                            </div>
                          );
                        })}

                        {view.spectator_mode && (
                          <div className="absolute inset-x-6 top-6 z-30 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-center text-sm font-bold text-cyan-50">
                            라운드 종료까지 관전 중입니다. 남아 있는 플레이어 손패를 공개합니다.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/60">My Hand Dock</p>
                          <h3 className="mt-2 text-2xl font-black text-white">내 손패</h3>
                          <p className="mt-2 text-sm leading-6 text-white/70">
                            {getCardSelectionGuide(selectedCard, validTargetIds, selectedTargetId)}
                          </p>
                        </div>
                        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={() => setLeaveConfirmOpen(true)}
                            disabled={loading}
                            className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-black text-white/85 transition hover:bg-white/10 disabled:opacity-45"
                          >
                            기권 후 나가기
                          </button>
                          <button
                            type="button"
                            onClick={() => void playSelectedCard()}
                            disabled={!canConfirmPlay || loading || pendingBroadcaster}
                            className="rounded-full bg-[#d95b5f] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ea6c70] disabled:opacity-45"
                          >
                            카드 공개
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                        <div className="flex gap-4 overflow-x-auto pb-2">
                          {myHand.length > 0 ? (
                            myHand.map((cardId, index) => (
                              <div
                                key={`${cardId}-${index}-${index === 0 ? "first" : "second"}`}
                                className="w-[min(240px,72vw)] shrink-0"
                              >
                                <LoveLetterCardFace
                                  cardId={cardId}
                                  imageOnly
                                  selected={selectedCardId === cardId}
                                  emphasis={myTurn && selectedCardId !== cardId}
                                  disabled={!myTurn || pendingBroadcaster || loading}
                                  onClick={myTurn ? () => setSelectedCardId(cardId) : undefined}
                                />
                              </div>
                            ))
                          ) : (
                            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/55">
                              현재 손패가 없습니다.
                            </div>
                          )}
                        </div>

                        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/60">Selection</p>
                          <div className="mt-4 space-y-3">
                            <div className="rounded-[1.1rem] border border-white/10 bg-black/25 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">선택 카드</p>
                              <p className="mt-2 text-sm font-bold text-white">
                                {selectedCard ? `${selectedCard.name}(${selectedCard.id})` : "없음"}
                              </p>
                            </div>
                            <div className="rounded-[1.1rem] border border-white/10 bg-black/25 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">지목 대상</p>
                              <p className="mt-2 text-sm font-bold text-white">
                                {selectedTargetId ? playerMap[selectedTargetId]?.nickname_snapshot ?? "선택됨" : "없음"}
                              </p>
                            </div>
                            {needsTarget && (
                              <div className="flex flex-wrap gap-2">
                                {validTargetIds.map((targetId) => (
                                  <button
                                    key={targetId}
                                    type="button"
                                    onClick={() => setSelectedTargetId(targetId)}
                                    className={`rounded-full px-3 py-2 text-xs font-black transition ${selectedTargetId === targetId
                                      ? "bg-white text-[#250e1c]"
                                      : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                      }`}
                                  >
                                    {playerMap[targetId]?.nickname_snapshot ?? "플레이어"}
                                  </button>
                                ))}
                              </div>
                            )}
                            {needsGuess && (
                              <div className="rounded-[1.1rem] border border-white/10 bg-black/25 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">추측 카드</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {guessableCards.map((cardId) => (
                                    <button
                                      key={cardId}
                                      type="button"
                                      onClick={() => setSelectedGuessId(cardId)}
                                      className={`rounded-full px-3 py-2 text-xs font-black transition ${selectedGuessId === cardId
                                        ? "bg-white text-[#250e1c]"
                                        : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                        }`}
                                    >
                                      {getLoveLetterCard(cardId).name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {room.status === "finished" && (
              <section className="mt-6 rounded-[2rem] border border-white/10 bg-black/25 p-5 backdrop-blur-xl md:p-6">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/60">Game Finished</p>
                    <h2 className="mt-2 text-3xl font-black text-white">게임 종료</h2>
                    <p className="mt-4 text-sm leading-6 text-white/75">
                      {room.last_departed_nickname
                        ? `${room.last_departed_nickname}님이 떠나 게임을 종료합니다.`
                        : matchWinnerSet.size > 0
                          ? `최종 승자: ${Array.from(matchWinnerSet)
                            .map((winnerId) => playerMap[winnerId]?.nickname_snapshot ?? "플레이어")
                            .join(", ")}`
                          : "최종 결과가 확정되었습니다."}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {activePlayers.map((player) => (
                        <span
                          key={`${player.player_id}-final-chip`}
                          className={`rounded-full px-3 py-2 text-xs font-black ${matchWinnerSet.has(player.player_id)
                            ? "border border-amber-200/35 bg-amber-300/12 text-amber-50"
                            : "border border-white/10 bg-white/5 text-white/65"
                            }`}
                        >
                          {player.nickname_snapshot} · 토큰 {player.token_count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#f7d6d5]/60">Final Actions</p>
                    <div className="mt-4 flex flex-col gap-3">
                      {canResetToLobby && (
                        <button
                          type="button"
                          onClick={() => void resetRoom()}
                          disabled={loading}
                          className="rounded-full bg-[#d95b5f] px-4 py-3 text-sm font-black text-white disabled:opacity-45"
                        >
                          Room으로 복귀
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setLeaveConfirmOpen(true)}
                        disabled={loading}
                        className="rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-white/85 disabled:opacity-45"
                      >
                        게임 나가기
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {showVerdict && roomFinished && <FinalVerdictOverlay text={verdictText} />}

      {privateResult && <PrivateResultModal result={privateResult} onClose={() => setPrivateResult(null)} />}

      {leaveConfirmOpen && (
        <LeaveConfirmModal
          playing={room?.status === "playing"}
          onCancel={() => setLeaveConfirmOpen(false)}
          onConfirm={() => void leaveRoom()}
        />
      )}

      {pendingBroadcaster && view && (
        <BroadcasterModal
          options={view.pending_input.broadcaster_options}
          keptCardId={broadcasterKeptCardId}
          bottomOrder={broadcasterBottomOrder}
          onPickKept={(cardId) => {
            setBroadcasterKeptCardId(cardId);
            setBroadcasterBottomOrder(view.pending_input.broadcaster_options.filter((candidate) => candidate !== cardId));
          }}
          onMove={(index, direction) => {
            if (direction === "left" && index > 0) {
              setBroadcasterBottomOrder((current) => swapArrayEntries(current, index, index - 1));
            }
            if (direction === "right" && index < broadcasterBottomOrder.length - 1) {
              setBroadcasterBottomOrder((current) => swapArrayEntries(current, index, index + 1));
            }
          }}
          onSubmit={() => void resolveBroadcaster()}
          onClose={() => setPrivateResult(null)}
          loading={loading}
        />
      )}
    </main>
  );
}
