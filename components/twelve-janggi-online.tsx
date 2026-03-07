"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import {
  type TjBoardCell,
  type TjHandCode,
  type TjOwner,
  type TjPieceKind,
  canTjPlayerSelectCell,
  createInitialTjBoard,
  decodeTjPieceCode,
  formatTjCellLabel,
  formatTjHandCode,
  formatTjPieceKind,
  getTjLegalDropTargets,
  getTjLegalMoveTargets,
  getTjOpponent,
  handCodeToTjPieceKind,
  normalizeTjBoard,
  normalizeTjHand,
  rowFromTjCell,
  toTjCanonicalCell,
} from "@/lib/twelve-janggi";

type TjRoomStatus = "waiting" | "playing" | "finished";
type TjWinnerReason = "capture_king" | "try" | "forfeit";
type TjMoveAction = "move" | "drop";

interface TjRoomRow {
  id: string;
  room_code: string;
  host_id: string;
  host_nickname: string;
  guest_id: string | null;
  guest_nickname: string | null;
  guest_ready: boolean;
  status: TjRoomStatus;
  turn_owner: string | null;
  first_turn_owner: string | null;
  pending_try_owner: string | null;
  winner_id: string | null;
  winner_reason: string | null;
  board: unknown;
  host_hand: unknown;
  guest_hand: unknown;
  move_count: number;
  updated_at: string;
}

interface TjRoom {
  id: string;
  room_code: string;
  host_id: string;
  host_nickname: string;
  guest_id: string | null;
  guest_nickname: string | null;
  guest_ready: boolean;
  status: TjRoomStatus;
  turn_owner: TjOwner | null;
  first_turn_owner: TjOwner | null;
  pending_try_owner: TjOwner | null;
  winner_id: string | null;
  winner_reason: TjWinnerReason | null;
  board: TjBoardCell[];
  host_hand: TjHandCode[];
  guest_hand: TjHandCode[];
  move_count: number;
  updated_at: string;
}

interface TjMoveLogRow {
  id: number;
  room_id: string;
  move_number: number;
  actor_id: string;
  action: string;
  piece_kind: string;
  from_cell: number | null;
  to_cell: number;
  captured_kind: string | null;
  promoted: boolean;
  created_at: string;
}

interface TjMoveLog {
  id: number;
  room_id: string;
  move_number: number;
  actor_id: string;
  action: TjMoveAction;
  piece_kind: TjPieceKind;
  from_cell: number | null;
  to_cell: number;
  captured_kind: TjPieceKind | null;
  promoted: boolean;
  created_at: string;
}

interface TjStatRow {
  user_id: string;
  wins: number | null;
  losses: number | null;
}

interface PlayerRecord {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

const ROOM_SELECT = [
  "id",
  "room_code",
  "host_id",
  "host_nickname",
  "guest_id",
  "guest_nickname",
  "guest_ready",
  "status",
  "turn_owner",
  "first_turn_owner",
  "pending_try_owner",
  "winner_id",
  "winner_reason",
  "board",
  "host_hand",
  "guest_hand",
  "move_count",
  "updated_at",
].join(",");

const MOVE_LOG_SELECT = [
  "id",
  "room_id",
  "move_number",
  "actor_id",
  "action",
  "piece_kind",
  "from_cell",
  "to_cell",
  "captured_kind",
  "promoted",
  "created_at",
].join(",");

function kindToTjAssetSlug(kind: TjPieceKind): string {
  if (kind === "JANG") return "jang";
  if (kind === "SANG") return "sang";
  if (kind === "KING") return "king";
  if (kind === "HU") return "hu";
  return "ja";
}

function getTjPieceImageCandidates(kind: TjPieceKind): string[] {
  return [`/images/twelve_janggi/${kindToTjAssetSlug(kind)}.png`];
}

const EMPTY_RECORD: PlayerRecord = {
  total: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
};

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizeOwner(value: string | null | undefined): TjOwner | null {
  return value === "host" || value === "guest" ? value : null;
}

function normalizeWinnerReason(value: string | null | undefined): TjWinnerReason | null {
  return value === "capture_king" || value === "try" || value === "forfeit" ? value : null;
}

function normalizePieceKind(value: string | null | undefined): TjPieceKind | null {
  return value === "JANG" || value === "SANG" || value === "KING" || value === "JA" || value === "HU" ? value : null;
}

function normalizeRoom(row: TjRoomRow): TjRoom {
  return {
    ...row,
    turn_owner: normalizeOwner(row.turn_owner),
    first_turn_owner: normalizeOwner(row.first_turn_owner),
    pending_try_owner: normalizeOwner(row.pending_try_owner),
    winner_reason: normalizeWinnerReason(row.winner_reason),
    board: normalizeTjBoard(row.board),
    host_hand: normalizeTjHand(row.host_hand),
    guest_hand: normalizeTjHand(row.guest_hand),
    move_count: Number(row.move_count ?? 0),
  };
}

function normalizeMoveLog(row: TjMoveLogRow): TjMoveLog | null {
  const pieceKind = normalizePieceKind(row.piece_kind);
  const action = row.action === "move" || row.action === "drop" ? row.action : null;
  if (!pieceKind || !action) return null;

  return {
    id: row.id,
    room_id: row.room_id,
    move_number: Number(row.move_number ?? 0),
    actor_id: row.actor_id,
    action,
    piece_kind: pieceKind,
    from_cell: row.from_cell === null ? null : Number(row.from_cell),
    to_cell: Number(row.to_cell),
    captured_kind: normalizePieceKind(row.captured_kind),
    promoted: Boolean(row.promoted),
    created_at: row.created_at,
  };
}

function buildRecord(winsValue: number | null | undefined, lossesValue: number | null | undefined): PlayerRecord {
  const wins = Number(winsValue ?? 0);
  const losses = Number(lossesValue ?? 0);
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return {
    total,
    wins,
    losses,
    winRate,
  };
}

function winnerReasonLabel(reason: TjWinnerReason | null) {
  if (reason === "capture_king") return "왕 포획";
  if (reason === "try") return "왕 침투";
  if (reason === "forfeit") return "기권";
  return "종료";
}

function statusLabel(status: TjRoomStatus) {
  if (status === "waiting") return "대기 중";
  if (status === "playing") return "진행 중";
  return "종료";
}

function formatTjError(raw: string, code?: string) {
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  if (code === "PGRST202" || lower.includes("could not find the function public.tj_")) {
    return "십이장기용 Supabase 함수가 아직 없습니다. docs/supabase-twelve-janggi.sql을 적용해 주세요.";
  }

  if (upper.includes("AUTH_REQUIRED")) return "로그인 후 다시 시도해 주세요.";
  if (upper.includes("INVALID_ROOM_CODE")) return "방 코드는 6자리여야 합니다.";
  if (upper.includes("ROOM_NOT_FOUND")) return "방을 찾을 수 없습니다.";
  if (upper.includes("ROOM_FULL")) return "이미 두 명이 입장한 방입니다.";
  if (upper.includes("ROOM_ALREADY_STARTED")) return "이미 시작된 방입니다.";
  if (upper.includes("ROOM_NOT_PLAYING")) return "현재 진행 중인 게임이 아닙니다.";
  if (upper.includes("NOT_ROOM_MEMBER")) return "이 방의 참가자만 사용할 수 있습니다.";
  if (upper.includes("ONLY_HOST_CAN_START")) return "호스트만 게임을 시작할 수 있습니다.";
  if (upper.includes("ONLY_HOST_CAN_RESET")) return "호스트만 방을 초기화할 수 있습니다.";
  if (upper.includes("ONLY_GUEST_CAN_SET_READY")) return "게스트만 준비 상태를 바꿀 수 있습니다.";
  if (upper.includes("GUEST_NOT_JOINED")) return "게스트가 아직 입장하지 않았습니다.";
  if (upper.includes("GUEST_NOT_READY")) return "게스트가 준비를 완료해야 시작할 수 있습니다.";
  if (upper.includes("NOT_YOUR_TURN")) return "지금은 당신의 차례가 아닙니다.";
  if (upper.includes("INVALID_MOVE")) return "해당 말은 그 칸으로 이동할 수 없습니다.";
  if (upper.includes("INVALID_DROP")) return "그 칸에는 포로를 내려놓을 수 없습니다.";
  if (upper.includes("HAND_PIECE_NOT_AVAILABLE")) return "보유하지 않은 포로입니다.";
  if (upper.includes("INVALID_SOURCE_CELL")) return "선택한 말이 올바르지 않습니다.";
  if (upper.includes("TARGET_OCCUPIED")) return "이미 말이 놓인 칸입니다.";
  if (upper.includes("GAME_ALREADY_FINISHED")) return "이미 종료된 게임입니다.";
  if (upper.includes("NICKNAME_REQUIRED")) return "닉네임이 필요합니다. 랜딩에서 먼저 설정해 주세요.";
  if (lower.includes("duplicate key value")) return "이미 사용 중인 데이터가 있어 요청을 처리하지 못했습니다.";

  return raw;
}

function moveLogLabel(log: TjMoveLog) {
  const pieceLabel = formatTjPieceKind(log.piece_kind);

  if (log.action === "drop") {
    return `${pieceLabel} 배치`;
  }

  const captureLabel = log.captured_kind ? ` · ${formatTjPieceKind(log.captured_kind)} 포획` : "";
  const promoteLabel = log.promoted ? " · 후 승격" : "";
  return `${pieceLabel} 이동${captureLabel}${promoteLabel}`;
}

function statusChipClasses(status: TjRoomStatus) {
  if (status === "waiting") return "border border-lime-300/25 bg-lime-300/10 text-lime-100";
  if (status === "playing") return "border border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  return "border border-white/15 bg-white/10 text-white";
}

function AnimatedVerdict({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    >
      <div className="flex gap-1 text-5xl font-black tracking-wider text-lime-100 md:text-7xl">
        {text.split("").map((char, index) => (
          <motion.span
            key={`${char}-${index}`}
            initial={{ opacity: 0, y: 40, rotateX: -90, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{ duration: 0.28, delay: index * 0.06 }}
          >
            {char}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

export function TwelveJanggiOnline({ entryHref = "/" }: { entryHref?: string }) {
  const {
    userId,
    nickname: authNickname,
    requiresNickname,
    isLoading: authLoading,
    profileLoading,
  } = useAuth();

  const [room, setRoom] = useState<TjRoom | null>(null);
  const [moveLogs, setMoveLogs] = useState<TjMoveLog[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [profileRecords, setProfileRecords] = useState<Record<string, PlayerRecord>>({});
  const [record, setRecord] = useState<PlayerRecord>(EMPTY_RECORD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [selectedBoardCell, setSelectedBoardCell] = useState<number | null>(null);
  const [selectedHandCode, setSelectedHandCode] = useState<TjHandCode | null>(null);
  const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [showVerdict, setShowVerdict] = useState(false);
  const [lastRoomSnapshot, setLastRoomSnapshot] = useState<TjRoom | null>(null);

  const roomRef = useRef<TjRoom | null>(null);
  const userIdRef = useRef<string | null>(null);
  const latestRoomFetchSeqRef = useRef(0);
  const latestMoveLogFetchSeqRef = useRef(0);
  const cleanupTriggeredUsersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const clearRoomScopedState = useCallback(() => {
    latestRoomFetchSeqRef.current += 1;
    latestMoveLogFetchSeqRef.current += 1;
    roomRef.current = null;
    setRoom(null);
    setMoveLogs([]);
    setSelectedBoardCell(null);
    setSelectedHandCode(null);
    setLeaveConfirmOpen(false);
    setShowVerdict(false);
    setLastRoomSnapshot(null);
  }, []);

  const loadMoveLogs = useCallback(async (roomId: string) => {
    if (!supabase) return;
    const fetchSeq = ++latestMoveLogFetchSeqRef.current;

    const { data, error: moveLogError } = await supabase
      .from("tj_move_logs")
      .select(MOVE_LOG_SELECT)
      .eq("room_id", roomId)
      .order("move_number", { ascending: true });

    if (fetchSeq !== latestMoveLogFetchSeqRef.current) return;
    if (roomRef.current?.id !== roomId) return;

    if (moveLogError || !data) {
      setMoveLogs([]);
      return;
    }

    const normalized = (data as unknown as TjMoveLogRow[])
      .map(normalizeMoveLog)
      .filter((row): row is TjMoveLog => row !== null);

    setMoveLogs(normalized);
  }, []);

  const loadStats = useCallback(async (ids: string[]) => {
    if (!supabase) return;
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const { data } = await supabase
      .from("tj_player_stats")
      .select("user_id,wins,losses")
      .in("user_id", uniqueIds);

    const mapped: Record<string, PlayerRecord> = {};
    (data as unknown as TjStatRow[] | null)?.forEach((row) => {
      mapped[row.user_id] = buildRecord(row.wins, row.losses);
    });

    setProfileRecords((previous) => ({ ...previous, ...mapped }));
  }, []);

  const loadMyRecord = useCallback(async (uid: string) => {
    if (!supabase) return;

    const { data } = await supabase
      .from("tj_player_stats")
      .select("wins,losses")
      .eq("user_id", uid)
      .maybeSingle();

    setRecord(buildRecord(data?.wins, data?.losses));
  }, []);

  const handleRoomSync = useCallback(async (nextRoomRow: TjRoomRow) => {
    const nextRoom = normalizeRoom(nextRoomRow);
    const currentRoom = roomRef.current;

    if (currentRoom && currentRoom.id === nextRoom.id) {
      const currentUpdatedAt = Date.parse(currentRoom.updated_at);
      const nextUpdatedAt = Date.parse(nextRoom.updated_at);

      if (Number.isFinite(currentUpdatedAt) && Number.isFinite(nextUpdatedAt) && nextUpdatedAt < currentUpdatedAt) {
        return;
      }
    }

    if (!currentRoom || currentRoom.id !== nextRoom.id) {
      setSelectedBoardCell(null);
      setSelectedHandCode(null);
    }

    roomRef.current = nextRoom;
    setRoom(nextRoom);

    await Promise.all([
      loadStats([nextRoom.host_id, nextRoom.guest_id ?? ""]),
      loadMoveLogs(nextRoom.id),
    ]);
  }, [loadMoveLogs, loadStats]);

  const loadLatestRoom = useCallback(async (uid: string) => {
    if (!supabase) return;
    const fetchSeq = ++latestRoomFetchSeqRef.current;
    const isObsolete = () => fetchSeq !== latestRoomFetchSeqRef.current || userIdRef.current !== uid;
    const currentRoomId = roomRef.current?.id ?? null;
    const currentRoom = roomRef.current;

    if (currentRoomId) {
      const { data: roomById } = await supabase
        .from("tj_rooms")
        .select(ROOM_SELECT)
        .eq("id", currentRoomId)
        .maybeSingle();

      if (isObsolete()) return;

      if (roomById) {
        const nextRoom = roomById as unknown as TjRoomRow;
        const currentUpdatedAt = currentRoom ? Date.parse(currentRoom.updated_at) : Number.NaN;
        const nextUpdatedAt = Date.parse(nextRoom.updated_at);

        if (!currentRoom || !Number.isFinite(currentUpdatedAt) || !Number.isFinite(nextUpdatedAt) || nextUpdatedAt > currentUpdatedAt) {
          await handleRoomSync(nextRoom);
        }
        return;
      }
    }

    const statusFilter = roomRef.current?.status === "finished"
      ? ["playing", "waiting", "finished"]
      : ["playing", "waiting"];

    const { data } = await supabase
      .from("tj_rooms")
      .select(ROOM_SELECT)
      .or(`host_id.eq.${uid},guest_id.eq.${uid}`)
      .in("status", statusFilter)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isObsolete()) return;

    if (data) {
      const nextRoom = data as unknown as TjRoomRow;
      const currentUpdatedAt = currentRoom ? Date.parse(currentRoom.updated_at) : Number.NaN;
      const nextUpdatedAt = Date.parse(nextRoom.updated_at);

      if (!currentRoom || currentRoom.id !== nextRoom.id || !Number.isFinite(currentUpdatedAt) || !Number.isFinite(nextUpdatedAt) || nextUpdatedAt > currentUpdatedAt) {
        await handleRoomSync(nextRoom);
      }
      return;
    }

    clearRoomScopedState();
  }, [clearRoomScopedState, handleRoomSync]);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase 설정이 없어 실행할 수 없습니다.");
      return;
    }

    if (authLoading) return;

    if (!userId) {
      clearRoomScopedState();
      setProfileRecords({});
      setRecord(EMPTY_RECORD);
      return;
    }

    userIdRef.current = userId;

    if (!cleanupTriggeredUsersRef.current.has(userId)) {
      cleanupTriggeredUsersRef.current.add(userId);
      void supabase.rpc("tj_cleanup_stale_finished_rooms").then(({ error: cleanupError }) => {
        if (cleanupError && cleanupError.code !== "PGRST202" && cleanupError.code !== "42883") {
          console.warn("tj cleanup failed", cleanupError.message);
        }
      });
    }

    void loadMyRecord(userId);
    void loadLatestRoom(userId);
  }, [authLoading, clearRoomScopedState, loadLatestRoom, loadMyRecord, userId]);

  useEffect(() => {
    const handleVisibility = () => {
      setIsPageVisible(!document.hidden);
    };

    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!supabase || !room || !userId) return;

    const client = supabase;
    setRealtimeSubscribed(false);

    const channel = client
      .channel(`tj-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tj_rooms", filter: `id=eq.${room.id}` },
        async (payload) => {
          const nextRoom = payload.new as unknown as TjRoomRow | null;
          if (nextRoom?.id) {
            await handleRoomSync(nextRoom);
          } else {
            await loadLatestRoom(userId);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tj_move_logs", filter: `room_id=eq.${room.id}` },
        async () => {
          await Promise.all([loadMoveLogs(room.id), loadLatestRoom(userId)]);
        }
      )
      .subscribe((status) => {
        setRealtimeSubscribed(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void loadLatestRoom(userId);
        }
      });

    return () => {
      setRealtimeSubscribed(false);
      client.removeChannel(channel);
    };
  }, [handleRoomSync, loadLatestRoom, loadMoveLogs, room, userId]);

  useEffect(() => {
    if (!userId) return;
    if (!room) return;

    void loadLatestRoom(userId);
    void loadMyRecord(userId);

    const refreshIntervalMs = room.status === "playing"
      ? (isPageVisible ? 1200 : 2500)
      : 1000;
    const timer = setInterval(() => {
      void loadLatestRoom(userId);
      void loadMyRecord(userId);
    }, refreshIntervalMs);

    return () => clearInterval(timer);
  }, [isPageVisible, loadLatestRoom, loadMyRecord, realtimeSubscribed, room, userId]);

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setSelectedBoardCell(null);
    setSelectedHandCode(null);
  }, [room?.move_count, room?.status, room?.turn_owner]);

  const inRoom = Boolean(room);
  const myRole = useMemo(() => {
    if (!room || !userId) return null;
    if (room.host_id === userId) return "host";
    if (room.guest_id === userId) return "guest";
    return null;
  }, [room, userId]);
  const myOwner = myRole as TjOwner | null;
  const perspective = myOwner ?? "host";
  const board = room?.board ?? createInitialTjBoard();
  const hostName = room?.host_nickname?.trim() || "호스트";
  const guestName = room?.guest_nickname?.trim() || "게스트";
  const hostRecord = room ? profileRecords[room.host_id] ?? EMPTY_RECORD : EMPTY_RECORD;
  const guestRecord = room?.guest_id ? profileRecords[room.guest_id] ?? EMPTY_RECORD : EMPTY_RECORD;
  const myHand = myOwner ? (myOwner === "host" ? room?.host_hand ?? [] : room?.guest_hand ?? []) : [];
  const opponentHand = myOwner
    ? (getTjOpponent(myOwner) === "host" ? room?.host_hand ?? [] : room?.guest_hand ?? [])
    : [];
  const myTurn = Boolean(room && myOwner && room.status === "playing" && room.turn_owner === myOwner);
  const selectedMoveTargets = useMemo(() => {
    if (!myOwner || selectedBoardCell === null || !myTurn) return [];
    if (!canTjPlayerSelectCell(board, myOwner, selectedBoardCell)) return [];
    return getTjLegalMoveTargets(board, selectedBoardCell);
  }, [board, myOwner, myTurn, selectedBoardCell]);
  const selectedDropTargets = useMemo(() => {
    if (!myOwner || !selectedHandCode || !myTurn) return [];
    return getTjLegalDropTargets(board, myOwner);
  }, [board, myOwner, myTurn, selectedHandCode]);
  const selectedMoveTargetSet = useMemo(() => new Set(selectedMoveTargets), [selectedMoveTargets]);
  const selectedDropTargetSet = useMemo(() => new Set(selectedDropTargets), [selectedDropTargets]);
  const lastMove = moveLogs.length > 0 ? moveLogs[moveLogs.length - 1] : null;
  const finishedByForfeit = useMemo(() => {
    if (!room || room.status !== "finished") return false;
    return room.winner_reason === "forfeit" && Boolean(room.winner_id);
  }, [room]);
  const myResultText = useMemo(() => {
    if (!room || room.status !== "finished" || !userId) return "";
    if (!room.winner_id) return "게임 종료";
    return room.winner_id === userId ? "승리!" : "패배...";
  }, [room, userId]);
  const currentTurnName = room?.turn_owner === "host" ? hostName : room?.turn_owner === "guest" ? guestName : "-";
  const currentTurnRecord = room?.turn_owner === "host" ? hostRecord : guestRecord;
  const myDisplayNickname = authNickname.trim() || (myRole === "host" ? hostName : guestName);
  const needsDefenseAgainstTry = Boolean(room && myOwner && room.pending_try_owner === getTjOpponent(myOwner));
  const tryOwnerName = room?.pending_try_owner === "host" ? hostName : room?.pending_try_owner === "guest" ? guestName : "";
  const winnerName = room?.winner_id === room?.host_id ? hostName : room?.winner_id === room?.guest_id ? guestName : "";
  const boardRows = Array.from({ length: 4 }, (_, rowIndex) =>
    Array.from({ length: 3 }, (_, colIndex) => rowIndex * 3 + colIndex)
  );
  const starterName = room?.first_turn_owner === "host" ? hostName : room?.first_turn_owner === "guest" ? guestName : "-";

  useEffect(() => {
    if (!room) {
      setLastRoomSnapshot(null);
      return;
    }

    if (!lastRoomSnapshot) {
      setLastRoomSnapshot(room);
      return;
    }

    const justFinishedWithWinner =
      lastRoomSnapshot.status === "playing" &&
      room.status === "finished" &&
      Boolean(room.winner_id);

    if (justFinishedWithWinner && userId && room.winner_id === userId && finishedByForfeit) {
      setNotice("상대 플레이어가 기권했습니다. 종료 화면에서 최종 보드를 확인할 수 있습니다.");
      setLeaveConfirmOpen(false);
    }

    setLastRoomSnapshot(room);
  }, [finishedByForfeit, lastRoomSnapshot, room, userId]);

  useEffect(() => {
    if (!room || room.status !== "finished") {
      setShowVerdict(false);
      return;
    }

    setShowVerdict(true);
    const timer = setTimeout(() => {
      setShowVerdict(false);
    }, 2600);

    return () => clearTimeout(timer);
  }, [room?.status, room?.winner_id]);

  const createRoom = async () => {
    if (!supabase) return;
    const nickname = authNickname.trim();
    if (!nickname) {
      setError("닉네임이 필요합니다. 랜딩 페이지에서 먼저 설정해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: createError } = await supabase.rpc("tj_create_room", {
      p_room_code: makeRoomCode(),
      p_nickname: nickname,
    });

    if (createError) {
      setError(formatTjError(createError.message, createError.code));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as unknown as TjRoomRow);
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

    const { data, error: joinError } = await supabase.rpc("tj_join_room", {
      p_room_code: roomCodeInput.trim().toUpperCase(),
      p_nickname: nickname,
    });

    if (joinError) {
      setError(formatTjError(joinError.message, joinError.code));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as unknown as TjRoomRow);
    setLoading(false);
  };

  const setGuestReady = async (ready: boolean) => {
    if (!supabase || !room) return;

    setLoading(true);
    setError("");

    const { data, error: readyError } = await supabase.rpc("tj_set_guest_ready", {
      p_room_id: room.id,
      p_ready: ready,
    });

    if (readyError) {
      setError(formatTjError(readyError.message, readyError.code));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as unknown as TjRoomRow);
    setNotice(ready ? "준비 완료" : "준비 해제");
    setLoading(false);
  };

  const startGame = async () => {
    if (!supabase || !room) return;

    setLoading(true);
    setError("");

    const { data, error: startError } = await supabase.rpc("tj_start_game", {
      p_room_id: room.id,
    });

    if (startError) {
      setError(formatTjError(startError.message, startError.code));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as unknown as TjRoomRow);
    setNotice("대국 시작");
    setLoading(false);
  };

  const movePiece = async (fromCell: number, toCell: number) => {
    if (!supabase || !room || !myTurn) return;

    setLoading(true);
    setError("");

    const { data, error: moveError } = await supabase.rpc("tj_move_piece", {
      p_room_id: room.id,
      p_from_cell: fromCell,
      p_to_cell: toCell,
    });

    if (moveError) {
      setError(formatTjError(moveError.message, moveError.code));
      setLoading(false);
      return;
    }

    setSelectedBoardCell(null);
    await handleRoomSync(data as unknown as TjRoomRow);
    setLoading(false);
  };

  const dropPiece = async (handCode: TjHandCode, toCell: number) => {
    if (!supabase || !room || !myTurn) return;

    setLoading(true);
    setError("");

    const { data, error: dropError } = await supabase.rpc("tj_drop_piece", {
      p_room_id: room.id,
      p_piece_kind: handCodeToTjPieceKind(handCode),
      p_to_cell: toCell,
    });

    if (dropError) {
      setError(formatTjError(dropError.message, dropError.code));
      setLoading(false);
      return;
    }

    setSelectedHandCode(null);
    await handleRoomSync(data as unknown as TjRoomRow);
    setLoading(false);
  };

  const resetRoom = async () => {
    if (!supabase || !room) return;

    setLoading(true);
    setError("");

    const { data, error: resetError } = await supabase.rpc("tj_reset_room", {
      p_room_id: room.id,
    });

    if (resetError) {
      setError(formatTjError(resetError.message, resetError.code));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as unknown as TjRoomRow);
    setNotice("방이 초기화되었습니다.");
    setLoading(false);
  };

  const leaveRoom = async () => {
    if (!supabase || !room) return;

    setLoading(true);
    setError("");

    const { error: leaveError } = await supabase.rpc("tj_leave_room", {
      p_room_id: room.id,
    });

    if (leaveError) {
      const formatted = formatTjError(leaveError.message, leaveError.code);
      if (formatted === "방을 찾을 수 없습니다.") {
        clearRoomScopedState();
        setNotice("방에서 나갔습니다.");
        setLoading(false);
        return;
      }

      setError(formatted);
      setLoading(false);
      return;
    }

    clearRoomScopedState();
    setNotice(room.status === "playing" ? "게임에서 나가 기권 처리되었습니다." : "방에서 나갔습니다.");
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

  const handleBoardCellClick = (canonicalCell: number) => {
    if (!room || !myOwner || !myTurn || loading) return;

    if (selectedHandCode) {
      if (selectedDropTargetSet.has(canonicalCell)) {
        void dropPiece(selectedHandCode, canonicalCell);
        return;
      }

      if (canTjPlayerSelectCell(board, myOwner, canonicalCell)) {
        setSelectedHandCode(null);
        setSelectedBoardCell(canonicalCell);
        return;
      }

      setSelectedHandCode(null);
      return;
    }

    if (selectedBoardCell !== null) {
      if (selectedMoveTargetSet.has(canonicalCell)) {
        void movePiece(selectedBoardCell, canonicalCell);
        return;
      }

      if (selectedBoardCell === canonicalCell) {
        setSelectedBoardCell(null);
        return;
      }
    }

    if (canTjPlayerSelectCell(board, myOwner, canonicalCell)) {
      setSelectedBoardCell(canonicalCell);
      setSelectedHandCode(null);
      return;
    }

    setSelectedBoardCell(null);
  };

  const handleHandPieceClick = (handCode: TjHandCode) => {
    if (!myTurn || loading) return;

    setSelectedBoardCell(null);
    setSelectedHandCode((current) => (current === handCode ? null : handCode));
  };

  if (!supabase) {
    return <div className="p-6 text-emerald-100">Supabase 설정이 없어 실행할 수 없습니다.</div>;
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-slate-50 md:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-10 top-10 h-64 w-64 rounded-full bg-lime-300/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-green-300/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl">
        <header className="mb-6 rounded-[2rem] border border-emerald-200/10 bg-[#051712]/75 p-5 shadow-[0_30px_80px_rgba(4,18,14,0.45)] backdrop-blur-xl md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.42em] text-lime-100/75">Twelve Janggi</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">십이장기</h1>
              <p className="mt-3 text-sm leading-6 text-emerald-50/70 md:text-base">
                좁은 전장, 그러나 타협 없는 지략의 충돌
                <br />
                앞으로 나아갈 것인가, 뒤를 내어줄 것인가. 당신의 선택은?
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-emerald-200/10 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-100/70">My Record</p>
              <p className="mt-2 text-lg font-bold text-white">{myDisplayNickname || "플레이어"}</p>
              <p className="mt-2 text-sm text-emerald-50/75">
                {record.total}전 {record.wins}승 {record.losses}패 ({record.winRate}%)
              </p>
              <Link
                href={entryHref}
                className="mt-4 inline-flex rounded-full border border-emerald-100/20 px-4 py-2 text-sm font-bold text-emerald-50/90 transition hover:bg-white/5"
              >
                BoardHub
              </Link>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-950/30 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="mb-4 rounded-2xl border border-lime-200/15 bg-lime-300/10 p-4 text-sm text-lime-50"
            >
              {notice}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {leaveConfirmOpen && room && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
            >
              <motion.div
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 14, opacity: 0 }}
                className="w-full max-w-md rounded-[1.5rem] border border-emerald-200/10 bg-[#081b15] p-5 shadow-2xl"
              >
                <h3 className="text-lg font-bold text-white">정말 나가시겠어요?</h3>
                <p className="mt-3 text-sm text-emerald-50/75">
                  {room.status === "playing"
                    ? "지금 나가면 즉시 기권 처리되고 상대 승리로 게임이 종료됩니다."
                    : "나가면 현재 방에서 빠져나옵니다."}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaveConfirmOpen(false)}
                    disabled={loading}
                    className="rounded-full border border-emerald-100/20 px-4 py-2 text-sm text-emerald-50/80 disabled:opacity-60"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => void leaveRoom()}
                    disabled={loading}
                    className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-[#062219] disabled:opacity-60"
                  >
                    나가기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!authLoading && !userId && (
          <section className="rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/70 p-6 text-center backdrop-blur-xl">
            <h2 className="text-xl font-bold">로그인이 필요합니다.</h2>
            <p className="mt-3 text-sm text-emerald-50/75">랜딩 페이지에서 로그인한 뒤 다시 입장해 주세요.</p>
            <Link
              href={entryHref}
              className="mt-5 inline-flex rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-[#062219]"
            >
              랜딩으로 이동
            </Link>
          </section>
        )}

        {userId && profileLoading && (
          <section className="mb-4 rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/70 p-5 backdrop-blur-xl">
            <h2 className="text-xl font-bold">닉네임 확인 중</h2>
            <p className="mt-3 text-sm text-emerald-50/75">랜딩에 저장된 닉네임 정보를 읽는 중입니다.</p>
          </section>
        )}

        {userId && !profileLoading && requiresNickname && (
          <section className="mb-4 rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/70 p-5 backdrop-blur-xl">
            <h2 className="text-xl font-bold">닉네임 설정이 필요합니다.</h2>
            <p className="mt-3 text-sm text-emerald-50/75">닉네임 설정은 랜딩 페이지에서 진행합니다. 저장 후 다시 입장해 주세요.</p>
            <Link
              href={entryHref}
              className="mt-5 inline-flex rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-[#062219]"
            >
              랜딩으로 이동
            </Link>
          </section>
        )}

        {userId && !profileLoading && !requiresNickname && !inRoom && (
          <section className="mb-4 rounded-2xl border border-emerald-900/50 bg-black/45 p-5 backdrop-blur-md">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Room Lobby</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void createRoom()}
                disabled={loading}
                className="rounded-xl bg-emerald-400 px-4 py-3 text-lg font-bold text-black disabled:opacity-60"
              >
                방 만들기
              </button>

              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-emerald-900/60 bg-black/40 px-3 py-2 uppercase text-white outline-none placeholder:text-emerald-50/25"
                  placeholder="방 코드 6자리"
                  value={roomCodeInput}
                  onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={() => void joinRoom()}
                  disabled={loading}
                  className="rounded-lg bg-emerald-400 px-4 py-2 font-bold text-black disabled:opacity-60"
                >
                  입장
                </button>
              </div>
            </div>
          </section>
        )}

        {room && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-emerald-900/50 bg-black/45 p-5 backdrop-blur-md">
                <div className={`flex flex-wrap items-start gap-4 ${room.status === "waiting" ? "justify-between" : "justify-end"}`}>
                  {room.status === "waiting" && (
                    <div>
                      <p className="text-sm text-emerald-100/70">ROOM CODE</p>
                      <div className="mt-2 flex items-center gap-3">
                        <p className="text-2xl font-black tracking-[0.2em] text-emerald-100">{room.room_code}</p>
                        <button
                          type="button"
                          onClick={() => void copyRoomCode()}
                          className="rounded-lg border border-emerald-100/20 px-3 py-1 text-xs font-bold text-emerald-50/80 transition hover:bg-white/5"
                        >
                          복사
                        </button>
                      </div>
                    </div>
                  )}
                  {room.status === "waiting" ? (
                    <div className="text-right">
                      <p className="text-sm text-emerald-100/70">STATUS</p>
                      <p className="font-bold uppercase">{room.status}</p>
                    </div>
                  ) : (
                    <div className={`rounded-full px-3 py-1 text-xs font-bold ${statusChipClasses(room.status)}`}>
                      {statusLabel(room.status)}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <PlayerCard
                    title="호스트"
                    name={hostName}
                    record={hostRecord}
                    emphasized={myRole === "host" || room.status === "waiting"}
                    readyState={room.status === "waiting" ? "상태 대기" : room.turn_owner === "host" ? "현재 차례" : "대기 중"}
                  />
                  <PlayerCard
                    title="게스트"
                    name={guestName}
                    record={guestRecord}
                    emphasized={myRole === "guest" || room.status === "waiting"}
                    readyState={room.status === "waiting" ? `상태 ${room.guest_ready ? "준비 완료" : "미준비"}` : room.turn_owner === "guest" ? "현재 차례" : "대기 중"}
                  />
                </div>

                {room.status === "waiting" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {myRole === "guest" && (
                      <button
                        type="button"
                        onClick={() => void setGuestReady(!room.guest_ready)}
                        disabled={loading}
                        className="rounded-lg bg-lime-200 px-4 py-2 font-bold text-[#0a281d] disabled:opacity-60"
                      >
                        {room.guest_ready ? "준비 취소" : "준비"}
                      </button>
                    )}
                    {myRole === "host" && (
                      <button
                        type="button"
                        onClick={() => void startGame()}
                        disabled={loading || !room.guest_id || !room.guest_ready}
                        className="rounded-lg bg-emerald-400 px-4 py-2 font-bold text-black disabled:opacity-40"
                      >
                        게임 시작
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLeaveConfirmOpen(true)}
                      className="rounded-lg border border-emerald-100/40 px-4 py-2"
                    >
                      Room 나가기
                    </button>
                  </div>
                )}

                {room.status === "playing" && (
                  <div className="mt-4 rounded-[1.25rem] border border-emerald-100/10 bg-black/15 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-white">{myTurn ? "내 차례" : `${currentTurnName} 차례`}</p>
                        <p className="mt-1 text-xs text-emerald-50/70">
                          선공: {room.first_turn_owner === "host" ? hostName : guestName} · 수순 {room.move_count}
                        </p>
                      </div>
                      <div className="text-right text-xs text-emerald-50/70">
                        <p>{currentTurnRecord.total}전 {currentTurnRecord.wins}승 {currentTurnRecord.losses}패</p>
                        <p>Realtime {realtimeSubscribed ? "연결됨" : "보조 동기화 중"}</p>
                      </div>
                    </div>

                    {room.pending_try_owner && (
                      <div className="mt-3 rounded-[1rem] border border-lime-100/15 bg-lime-200/10 p-3 text-sm text-lime-50">
                        {needsDefenseAgainstTry
                          ? `${tryOwnerName}의 왕이 침투했습니다. 이번 턴 안에 막지 못하면 패배합니다.`
                          : `${tryOwnerName}의 왕 침투가 성립 대기 중입니다.`}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setLeaveConfirmOpen(true)}
                        disabled={loading}
                        className="rounded-full border border-emerald-100/20 px-4 py-2 text-sm text-emerald-50/90 disabled:opacity-60"
                      >
                        기권 후 나가기
                      </button>
                    </div>
                  </div>
                )}

                {room.status === "finished" && (
                  <div className="mt-4 rounded-[1.25rem] border border-emerald-100/10 bg-black/15 p-4">
                    <p className="text-lg font-bold">게임 종료</p>
                    <p className="mt-1 text-emerald-50/80">
                      {winnerName ? `${winnerName} 승리` : "대국 종료"} · {winnerReasonLabel(room.winner_reason)}
                    </p>
                    <div className="mt-3 rounded-[1rem] border border-emerald-100/10 bg-[#0d2119] p-3 text-sm">
                      <div className="grid gap-2 text-emerald-50/80 md:grid-cols-3">
                        <p>최종 판정: {winnerReasonLabel(room.winner_reason)}</p>
                        <p>총 수순: {room.move_count}</p>
                        <p>선공: {starterName}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {myRole === "host" && !finishedByForfeit && (
                        <button
                          type="button"
                          onClick={() => void resetRoom()}
                          disabled={loading}
                          className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-[#062219] disabled:opacity-60"
                        >
                          Room으로 복귀
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setLeaveConfirmOpen(true)}
                        className="rounded-full border border-emerald-100/20 px-4 py-2 text-sm text-emerald-50/90"
                      >
                        게임 나가기
                      </button>
                      {myRole === "host" && finishedByForfeit && (
                        <p className="text-sm text-emerald-50/70">상대가 기권 후 나가 Room으로 복귀할 수 없습니다.</p>
                      )}
                      {myRole !== "host" && (
                        <p className="text-sm text-emerald-50/70">
                          {finishedByForfeit
                            ? "상대가 기권 후 나가 Room으로 복귀할 수 없습니다."
                            : "호스트가 Room 복귀 버튼을 누르면 다음 대국을 준비할 수 있습니다."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/75 p-5 backdrop-blur-xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-100/70">Battlefield</p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      {room.status === "waiting" ? "초기 배치 미리보기" : room.status === "playing" ? "실시간 대국 중" : "최종 보드 상태"}
                    </h2>
                  </div>
                  <div className="text-right text-xs text-emerald-50/70">
                    <p>내 진영은 아래쪽에 고정됩니다.</p>
                    <p>초록 표시 칸은 현재 선택된 행동이 가능한 칸입니다.</p>
                  </div>
                </div>

                <HandRow
                  title={myOwner ? `${myOwner === "host" ? guestName : hostName} 포로` : "상단 포로"}
                  subtitle="상대 손패"
                  hand={opponentHand}
                  owner={myOwner ? getTjOpponent(myOwner) : null}
                  viewerOwner={myOwner}
                  selected={null}
                  disabled
                  onSelect={() => { }}
                />

                <div className="mt-4 rounded-[1.6rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_top,rgba(187,247,208,0.08),transparent_42%),linear-gradient(180deg,rgba(8,27,21,0.92),rgba(5,18,14,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="grid gap-2">
                    {boardRows.map((row) => (
                      <div key={`board-row-${row[0]}`} className="grid grid-cols-3 gap-2">
                        {row.map((viewCell) => {
                          const canonicalCell = toTjCanonicalCell(viewCell, perspective);
                          const piece = decodeTjPieceCode(board[canonicalCell]);
                          const isSelectedCell = selectedBoardCell === canonicalCell;
                          const isMoveTarget = selectedMoveTargetSet.has(canonicalCell);
                          const isDropTarget = selectedDropTargetSet.has(canonicalCell);
                          const isLastFrom = lastMove?.from_cell === canonicalCell;
                          const isLastTo = lastMove?.to_cell === canonicalCell;
                          const cellRow = rowFromTjCell(viewCell);
                          const cellTheme = cellRow === 0
                            ? "border-emerald-300/15 bg-emerald-950/65"
                            : cellRow === 3
                              ? "border-lime-300/15 bg-lime-950/45"
                              : "border-emerald-100/10 bg-[#0a221a]/75";
                          const interactive = room.status === "playing" && myTurn;

                          return (
                            <motion.button
                              key={`board-cell-${canonicalCell}`}
                              type="button"
                              onClick={() => handleBoardCellClick(canonicalCell)}
                              disabled={!interactive}
                              whileHover={interactive ? { y: -2 } : undefined}
                              whileTap={interactive ? { scale: 0.98 } : undefined}
                              className={`relative aspect-square overflow-hidden rounded-[1.15rem] border p-2 text-left transition ${cellTheme} ${interactive ? "cursor-pointer" : "cursor-default"
                                } ${isSelectedCell
                                  ? "border-white/80 ring-2 ring-white shadow-[0_0_0_1px_rgba(255,255,255,0.4)]"
                                  : isMoveTarget || isDropTarget
                                    ? "ring-2 ring-emerald-300/70"
                                    : ""
                                } ${isLastTo ? "shadow-[0_0_0_1px_rgba(190,242,100,0.9)_inset]" : ""} ${isLastFrom ? "shadow-[0_0_0_1px_rgba(74,222,128,0.5)_inset]" : ""
                                }`}
                            >
                              <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/5 to-transparent" />
                              <span className="absolute left-2 top-2 text-[10px] font-bold text-emerald-50/35">
                                {formatTjCellLabel(canonicalCell)}
                              </span>

                              {(isMoveTarget || isDropTarget) && !piece && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="h-4 w-4 rounded-full bg-lime-200/80 shadow-[0_0_18px_rgba(190,242,100,0.45)]" />
                                </div>
                              )}

                              {piece ? (
                                <PieceToken
                                  piece={piece}
                                  viewerOwner={myOwner}
                                  emphasized={isSelectedCell || isLastTo}
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-emerald-50/12">•</div>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <HandRow
                  title={myOwner ? `${myOwner === "host" ? hostName : guestName} 포로` : "하단 포로"}
                  subtitle={myTurn ? "내가 지금 내려놓을 수 있는 포로" : "내 포로"}
                  hand={myHand}
                  owner={myOwner}
                  viewerOwner={myOwner}
                  selected={selectedHandCode}
                  disabled={!myTurn || loading}
                  onSelect={handleHandPieceClick}
                />

                {room.status === "playing" && myTurn && (
                  <div className="mt-4 rounded-[1rem] border border-emerald-100/10 bg-black/15 p-3 text-sm text-emerald-50/80">
                    {selectedHandCode
                      ? `${formatTjHandCode(selectedHandCode)}를 내려놓을 칸을 선택하세요. 상대 진영에는 둘 수 없습니다.`
                      : selectedBoardCell !== null
                        ? `${formatTjCellLabel(selectedBoardCell)}의 말을 이동할 수 있습니다.`
                        : "말 하나를 선택해 이동하거나, 포로를 선택해 내려놓으세요."}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/75 p-5 backdrop-blur-xl">
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-100/70">Live Feed</p>
                <h3 className="mt-2 text-xl font-black text-white">수순 로그</h3>
                <div className="mt-4 space-y-2">
                  {moveLogs.length === 0 && (
                    <div className="rounded-[1rem] border border-emerald-100/10 bg-black/15 p-4 text-sm text-emerald-50/70">
                      아직 기록된 수가 없습니다.
                    </div>
                  )}
                  {[...moveLogs].reverse().slice(0, 8).map((log) => {
                    const actorName = log.actor_id === room.host_id ? hostName : guestName;
                    return (
                      <div
                        key={log.id}
                        className="rounded-[1rem] border border-emerald-100/10 bg-black/15 p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-white">
                            {log.move_number}. {actorName}
                          </p>
                          <span className="text-[11px] uppercase tracking-[0.2em] text-emerald-50/45">{log.action}</span>
                        </div>
                        <p className="mt-2 text-sm text-emerald-50/80">{moveLogLabel(log)}</p>
                        <p className="mt-2 text-xs text-emerald-50/55">
                          {log.action === "drop"
                            ? `${formatTjPieceKind(log.piece_kind)} -> ${formatTjCellLabel(log.to_cell)}`
                            : `${formatTjCellLabel(log.from_cell ?? 0)} -> ${formatTjCellLabel(log.to_cell)}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/75 p-5 backdrop-blur-xl">
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-100/70">Rules Snapshot</p>
                <h3 className="mt-2 text-xl font-black text-white">핵심 규칙</h3>
                <div className="mt-4 grid gap-3">
                  <RuleCard
                    title="판과 배치"
                    lines={[
                      "3열 x 4행, 총 12칸",
                      "내 진영은 항상 아래쪽으로 표시",
                      "장/상/왕/자 4개로 시작",
                    ]}
                  />
                  <RuleCard
                    title="이동과 승격"
                    lines={[
                      "장: 상하좌우 1칸",
                      "상: 대각선 4방향 1칸",
                      "왕: 전 방향 1칸",
                      "자: 전방 1칸, 상대 진영 진입 시 후",
                    ]}
                  />
                  <RuleCard
                    title="포로와 승리"
                    lines={[
                      "잡은 말은 다음 턴부터 내 포로로 사용",
                      "포로는 상대 진영에 내려놓을 수 없음",
                      "왕 포획 또는 왕 침투 버티기 성공 시 승리",
                    ]}
                  />
                </div>
                <p className="mt-4 rounded-full border border-emerald-100/20 px-4 py-2 text-sm font-bold text-emerald-50/85">
                  규칙 문서 위치: `docs/twelve-janggi-rules.md`
                </p>
              </section>

              <section className="rounded-[1.75rem] border border-emerald-200/10 bg-[#071611]/75 p-5 backdrop-blur-xl">
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-100/70">Server Notes</p>
                <h3 className="mt-2 text-xl font-black text-white">Supabase 분리 상태</h3>
                <div className="mt-4 space-y-3 text-sm text-emerald-50/75">
                  <p>`tj_rooms`, `tj_move_logs`, `tj_player_stats` 전용 구조를 기준으로 동작합니다.</p>
                  <p>RPC가 아직 없다면 화면 상단에 SQL 적용 안내가 표시됩니다.</p>
                  <p>현재 화면은 `흑과백` 데이터와 채널 이름을 공유하지 않도록 설계했습니다.</p>
                </div>
              </section>
            </div>
          </section>
        )}
      </div>

      <AnimatePresence>{showVerdict && myResultText && <AnimatedVerdict text={myResultText} />}</AnimatePresence>
    </main>
  );
}

function PlayerCard({
  title,
  name,
  record,
  emphasized,
  readyState,
}: {
  title: string;
  name: string;
  record: PlayerRecord;
  emphasized: boolean;
  readyState: string;
}) {
  return (
    <div className={`rounded-xl bg-black/35 p-3 ${emphasized ? "border-2 border-white/90" : "border border-emerald-900/40"}`}>
      <p className="text-sm text-emerald-100/70">{title}</p>
      <p className="text-lg font-bold">{name}</p>
      <p className="text-sm">{readyState}</p>
      <p className="mt-1 text-xs text-emerald-100/80">
        전적 {record.total}전 {record.wins}승 {record.losses}패 ({record.winRate}%)
      </p>
    </div>
  );
}

function PieceToken({
  piece,
  viewerOwner,
  emphasized,
}: {
  piece: NonNullable<ReturnType<typeof decodeTjPieceCode>>;
  viewerOwner: TjOwner | null;
  emphasized: boolean;
}) {
  const mine = Boolean(viewerOwner && piece.owner === viewerOwner);
  const pieceLabel = formatTjPieceKind(piece.kind);

  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center rounded-[0.95rem] border px-2 py-3 shadow-lg ${mine
        ? "border-lime-200/60 bg-gradient-to-br from-lime-100 to-emerald-100 text-[#163423]"
        : "border-emerald-300/30 bg-gradient-to-br from-[#143228] to-[#091912] text-emerald-50"
        } ${emphasized ? "scale-[1.02] shadow-[0_0_0_1px_rgba(255,255,255,0.55)_inset]" : ""}`}
    >
      <span className="absolute left-2 top-2 z-10 text-[11px] font-bold uppercase tracking-[0.28em] opacity-60">
        {piece.owner === "host" ? "H" : "G"}
      </span>
      <TjPieceAsset
        candidates={getTjPieceImageCandidates(piece.kind)}
        alt={`${piece.owner === "host" ? "호스트" : "게스트"} ${pieceLabel}`}
        className="flex h-full w-full items-center justify-center"
        sizes="(max-width: 768px) 96px, 160px"
        imageClassName={`object-contain p-1.5 drop-shadow-[0_10px_18px_rgba(0,0,0,0.28)] ${mine ? "" : "rotate-180"}`}
        fallback={(
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl font-black leading-none">{pieceLabel}</span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] opacity-60">
              {piece.kind === "KING" ? "KING" : piece.kind === "JANG" ? "JANG" : piece.kind === "SANG" ? "SANG" : piece.kind}
            </span>
          </div>
        )}
      />
    </div>
  );
}

function HandRow({
  title,
  subtitle,
  hand,
  owner,
  viewerOwner,
  selected,
  disabled,
  onSelect,
}: {
  title: string;
  subtitle: string;
  hand: TjHandCode[];
  owner: TjOwner | null;
  viewerOwner: TjOwner | null;
  selected: TjHandCode | null;
  disabled: boolean;
  onSelect: (handCode: TjHandCode) => void;
}) {
  return (
    <div className="mt-4 rounded-[1.2rem] border border-emerald-100/10 bg-black/15 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-xs text-emerald-50/60">{subtitle}</p>
        </div>
        <span className="rounded-full border border-emerald-100/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-emerald-50/65">
          {hand.length}개
        </span>
      </div>

      <div className="flex min-h-16 flex-wrap gap-2">
        {hand.length === 0 && (
          <div className="flex h-14 min-w-24 items-center justify-center rounded-[1rem] border border-dashed border-emerald-100/10 px-4 text-sm text-emerald-50/35">
            없음
          </div>
        )}
        {hand.map((handCode, index) => (
          <button
            key={`${handCode}-${index}`}
            type="button"
            onClick={() => onSelect(handCode)}
            disabled={disabled}
            className={`min-w-[5.5rem] rounded-[1rem] border px-3 py-3 text-center transition ${selected === handCode
              ? "border-white bg-lime-100 text-[#163423] ring-2 ring-white/85"
              : "border-emerald-100/10 bg-[#10251d] text-emerald-50"
              } ${disabled ? "cursor-default opacity-75" : "hover:-translate-y-0.5"}`}
          >
            <TjPieceAsset
              candidates={getTjPieceImageCandidates(handCodeToTjPieceKind(handCode))}
              alt={`${owner === "host" ? "호스트" : owner === "guest" ? "게스트" : "포로"} ${formatTjHandCode(handCode)}`}
              className="mx-auto flex h-12 w-12 items-center justify-center"
              sizes="48px"
              imageClassName={`object-contain p-0.5 ${viewerOwner && owner && viewerOwner !== owner ? "rotate-180" : ""}`}
              fallback={<p className="text-lg font-black">{formatTjHandCode(handCode)}</p>}
            />
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] opacity-60">{handCode}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function TjPieceAsset({
  candidates,
  alt,
  className,
  sizes,
  imageClassName,
  fallback,
}: {
  candidates: string[];
  alt: string;
  className: string;
  sizes: string;
  imageClassName: string;
  fallback: ReactNode;
}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidateKey = candidates.join("|");

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  const src = candidates[candidateIndex];

  return (
    <div className={`relative ${className}`}>
      {src ? (
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          className={imageClassName}
          onError={() => {
            setCandidateIndex((current) => (current + 1 < candidates.length ? current + 1 : candidates.length));
          }}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function RuleCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-[1.1rem] border border-emerald-100/10 bg-black/15 p-4">
      <p className="text-sm font-bold text-white">{title}</p>
      <div className="mt-2 space-y-1">
        {lines.map((line) => (
          <p key={line} className="text-sm text-emerald-50/75">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
