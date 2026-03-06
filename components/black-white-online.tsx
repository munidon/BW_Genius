"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ALL_TILES, tileColor } from "@/lib/game";
import { supabase } from "@/lib/supabase";

type RoomStatus = "waiting" | "playing" | "finished";
type RoundPhase = "idle" | "await_lead" | "await_follow" | "resolved" | "finished";
type RoundResult = "HOST_WIN" | "GUEST_WIN" | "DRAW";
type BgmTrack = "lobby" | "waiting" | "playing";
type SfxKey = "uiClick" | "tileSubmit" | "readyConfirm" | "gameStart" | "victory" | "defeat" | "draw" | "leave" | "error";

const LOBBY_BGM_SRC = "/audio/bgm/lobby-loop.mp3";
const WAITING_BGM_SRC = "/audio/bgm/waiting-loop.mp3";
const PLAYING_BGM_SRC = "/audio/bgm/playing-loop.mp3";
const START_ORDER_COIN_FRONT_SRC = "/images/start-order/coin-front.jpg";
const START_ORDER_COIN_BACK_SRC = "/images/start-order/coin-back.jpg";

const STARTER_COIN_SPIN_DURATION_SEC = 2.25;
const STARTER_COIN_RESULT_HOLD_MS = 1500;
const BGM_VOLUME = 0.45;
const SFX_SOURCES: Record<SfxKey, string> = {
  uiClick: "/audio/sfx/current/ui-click.ogg",
  tileSubmit: "/audio/sfx/current/tile-submit.ogg",
  readyConfirm: "/audio/sfx/current/ready-confirm.ogg",
  gameStart: "/audio/sfx/current/game-start.ogg",
  victory: "/audio/sfx/current/victory.ogg",
  defeat: "/audio/sfx/current/defeat.ogg",
  draw: "/audio/sfx/current/draw.ogg",
  leave: "/audio/sfx/current/leave.ogg",
  error: "/audio/sfx/current/error.ogg",
};
const SFX_VOLUME: Record<SfxKey, number> = {
  uiClick: 0.55,
  tileSubmit: 0.75,
  readyConfirm: 0.7,
  gameStart: 0.75,
  victory: 0.75,
  defeat: 0.8,
  draw: 0.7,
  leave: 0.65,
  error: 0.7,
};

interface BwRoom {
  id: string;
  room_code: string;
  host_id: string;
  guest_id: string | null;
  guest_ready: boolean;
  status: RoomStatus;
  current_round: number;
  round_phase: RoundPhase;
  lead_player_id: string | null;
  host_score: number;
  guest_score: number;
  winner_id: string | null;
  updated_at: string;
}

interface BwRoundPublic {
  id: number;
  room_id: string;
  round_number: number;
  lead_player_id: string;
  follow_player_id: string;
  lead_submitted: boolean;
  follow_submitted: boolean;
  lead_tile_color: "black" | "white" | null;
  follow_tile_color: "black" | "white" | null;
  result: RoundResult | null;
  winner_id: string | null;
}

interface BwSubmission {
  id: number;
  room_id: string;
  round_number: number;
  player_id: string;
  tile: number;
}

interface ProfileRow {
  id: string;
  nickname: string;
  wins?: number | null;
  losses?: number | null;
}

interface PlayerRecord {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface RoomRevealRow {
  round_number: number;
  player_id: string;
  tile: number;
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function tileClass(tile: number) {
  return tileColor(tile) === "black"
    ? "bg-slate-950 text-slate-100 border-slate-700"
    : "bg-slate-100 text-slate-900 border-slate-300";
}

function AnimatedVerdict({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    >
      <div className="flex gap-1 text-5xl font-black tracking-wider text-amber-200 md:text-7xl">
        {text.split("").map((char, idx) => (
          <motion.span
            key={`${char}-${idx}`}
            initial={{ opacity: 0, y: 40, rotateX: -90, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{ duration: 0.28, delay: idx * 0.06 }}
          >
            {char}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

function StarterCoinOverlay({ role }: { role: "lead" | "follow" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const finalRotation = role === "lead" ? 720 : 900;
  const roleLabel = role === "lead" ? "先 플레이어" : "後 플레이어";
  const coinDepthPx = 16;

  useEffect(() => {
    let active = true;
    let loaded = 0;
    const onLoad = () => {
      loaded += 1;
      if (active && loaded === 2) setImageFailed(false);
    };
    const onError = () => {
      if (active) setImageFailed(true);
    };

    const frontProbe = new window.Image();
    frontProbe.onload = onLoad;
    frontProbe.onerror = onError;
    frontProbe.src = START_ORDER_COIN_FRONT_SRC;

    const backProbe = new window.Image();
    backProbe.onload = onLoad;
    backProbe.onerror = onError;
    backProbe.src = START_ORDER_COIN_BACK_SRC;

    return () => {
      active = false;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-5" style={{ perspective: "1000px", WebkitPerspective: "1000px" }}>
        <motion.div
          initial={{ rotateY: 0, rotateX: -6, scale: 0.85, opacity: 0.7 }}
          animate={{ rotateY: [0, 360, 540, finalRotation], rotateX: [-6, -2, 0, 0], scale: [0.85, 1.04, 1], opacity: [0.7, 1, 1] }}
          transition={{
            duration: STARTER_COIN_SPIN_DURATION_SEC,
            times: [0, 0.5, 0.78, 1],
            ease: ["easeIn", "linear", "easeOut"],
          }}
          style={{
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transformOrigin: "50% 50%",
            WebkitTransformOrigin: "50% 50%",
          }}
          className="relative h-52 w-52 md:h-64 md:w-64"
        >
          <div
            className={`absolute inset-0 overflow-hidden rounded-full border-2 border-amber-100/80 shadow-[0_18px_40px_rgba(0,0,0,0.55)] ${imageFailed ? "bg-gradient-to-br from-amber-500 to-amber-700" : ""}`}
            style={{
              transform: `translateZ(${coinDepthPx / 2}px)`,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transformStyle: "preserve-3d",
              WebkitTransformStyle: "preserve-3d",
              ...(imageFailed
                ? {}
                : {
                  backgroundImage: `url(${START_ORDER_COIN_FRONT_SRC})`,
                  backgroundSize: "108%",
                  backgroundPosition: "center",
                }),
            }}
          >
            {imageFailed && <div className="flex h-full items-center justify-center text-8xl font-black text-amber-100">先</div>}
          </div>
          <div
            className={`absolute inset-0 overflow-hidden rounded-full border-2 border-amber-100/80 shadow-[0_18px_40px_rgba(0,0,0,0.55)] ${imageFailed ? "bg-gradient-to-br from-amber-500 to-amber-700" : ""}`}
            style={{
              transform: `translateZ(${-coinDepthPx / 2}px) rotateY(180deg)`,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transformStyle: "preserve-3d",
              WebkitTransformStyle: "preserve-3d",
              ...(imageFailed
                ? {}
                : {
                  backgroundImage: `url(${START_ORDER_COIN_BACK_SRC})`,
                  backgroundSize: "108%",
                  backgroundPosition: "center",
                }),
            }}
          >
            {imageFailed && <div className="flex h-full items-center justify-center text-8xl font-black text-amber-100">後</div>}
          </div>
        </motion.div>
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

export function BlackWhiteOnline({ entryHref = "/" }: { entryHref?: string }) {
  const {
    userId,
    nickname: authNickname,
    requiresNickname,
    isLoading: authLoading,
    profileLoading,
  } = useAuth();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const [room, setRoom] = useState<BwRoom | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [rounds, setRounds] = useState<BwRoundPublic[]>([]);
  const [mySubmissions, setMySubmissions] = useState<BwSubmission[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileRecords, setProfileRecords] = useState<Record<string, PlayerRecord>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flyingTile, setFlyingTile] = useState<number | null>(null);
  const [showVerdict, setShowVerdict] = useState(false);
  const [showStarterCoin, setShowStarterCoin] = useState(false);
  const [starterRole, setStarterRole] = useState<"lead" | "follow" | null>(null);
  const [record, setRecord] = useState<PlayerRecord>({ total: 0, wins: 0, losses: 0, winRate: 0 });
  const [revealedRows, setRevealedRows] = useState<RoomRevealRow[]>([]);
  const [, setRevealsLoadedForRoomId] = useState<string | null>(null);
  const [lastRoomSnapshot, setLastRoomSnapshot] = useState<BwRoom | null>(null);
  const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const waitingBgmRef = useRef<HTMLAudioElement | null>(null);
  const playingBgmRef = useRef<HTMLAudioElement | null>(null);
  const activeBgmTrackRef = useRef<BgmTrack | null>(null);
  const desiredBgmTrackRef = useRef<BgmTrack | null>(null);
  const audioUnlockedRef = useRef(false);
  const lastBgmPositionRef = useRef(0);
  const sfxMapRef = useRef<Partial<Record<SfxKey, HTMLAudioElement>>>({});
  const previousRoomStatusRef = useRef<RoomStatus | null>(null);
  const previousNoticeRef = useRef("");
  const previousErrorRef = useRef("");
  const authSyncSeqRef = useRef(0);
  const latestRoundsFetchSeqRef = useRef(0);
  const latestSubmissionsFetchSeqRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const roomRef = useRef<BwRoom | null>(null);
  const emptyRoomReadCountRef = useRef(0);
  const cleanupTriggeredUsersRef = useRef<Set<string>>(new Set());

  const inRoom = Boolean(room);
  const desiredBgmTrack: BgmTrack = room ? (room.status === "playing" ? "playing" : "waiting") : "lobby";

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const getAudioByTrack = useCallback((track: BgmTrack | null) => {
    if (track === "lobby") return lobbyBgmRef.current;
    if (track === "waiting") return waitingBgmRef.current;
    if (track === "playing") return playingBgmRef.current;
    return null;
  }, []);

  const seekAudioWithCarryTime = useCallback((audio: HTMLAudioElement, carryTime: number) => {
    if (!Number.isFinite(carryTime) || carryTime < 0) return;

    const applySeek = () => {
      const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
      const targetTime = hasDuration ? carryTime % audio.duration : carryTime;
      if (!Number.isFinite(targetTime) || targetTime < 0) return;
      try {
        audio.currentTime = targetTime;
      } catch {
        // Some browsers can reject early seek calls before media is ready.
      }
    };

    if (audio.readyState >= 1) {
      applySeek();
      return;
    }

    audio.addEventListener("loadedmetadata", applySeek, { once: true });
  }, []);

  const pauseAllBgm = useCallback(() => {
    const activeAudio = getAudioByTrack(activeBgmTrackRef.current);
    if (activeAudio && Number.isFinite(activeAudio.currentTime)) {
      lastBgmPositionRef.current = activeAudio.currentTime;
    }
    lobbyBgmRef.current?.pause();
    waitingBgmRef.current?.pause();
    playingBgmRef.current?.pause();
    activeBgmTrackRef.current = null;
  }, [getAudioByTrack]);

  const switchBgmTrack = useCallback(
    async (nextTrack: BgmTrack | null) => {
      if (!nextTrack) {
        pauseAllBgm();
        return;
      }

      const nextAudio = getAudioByTrack(nextTrack);
      if (!nextAudio) return;

      const currentTrack = activeBgmTrackRef.current;
      const currentAudio = getAudioByTrack(currentTrack);

      if (currentTrack === nextTrack) {
        if (!audioUnlockedRef.current || !nextAudio.paused) return;
        try {
          await nextAudio.play();
        } catch {
          // Autoplay can remain blocked until a user gesture happens.
        }
        return;
      }

      let carryTime = lastBgmPositionRef.current;
      if (currentAudio && Number.isFinite(currentAudio.currentTime)) {
        carryTime = currentAudio.currentTime;
      }

      currentAudio?.pause();
      lastBgmPositionRef.current = carryTime;
      seekAudioWithCarryTime(nextAudio, carryTime);
      activeBgmTrackRef.current = nextTrack;

      if (!audioUnlockedRef.current) return;
      try {
        await nextAudio.play();
      } catch {
        // Autoplay can remain blocked until a user gesture happens.
      }
    },
    [getAudioByTrack, pauseAllBgm, seekAudioWithCarryTime]
  );

  const playSfx = useCallback((key: SfxKey) => {
    if (!audioUnlockedRef.current) return;
    const audio = sfxMapRef.current[key];
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // Browsers can still reject rapid successive calls in strict autoplay conditions.
    }
  }, []);

  const currentRound = useMemo(() => {
    if (!room || room.current_round <= 0) return null;
    return rounds.find((r) => r.round_number === room.current_round) ?? null;
  }, [room, rounds]);

  useEffect(() => {
    desiredBgmTrackRef.current = desiredBgmTrack;
    void switchBgmTrack(desiredBgmTrack);
  }, [desiredBgmTrack, switchBgmTrack]);

  useEffect(() => {
    const lobbyAudio = new Audio(LOBBY_BGM_SRC);
    lobbyAudio.loop = true;
    lobbyAudio.preload = "auto";
    lobbyAudio.volume = BGM_VOLUME;

    const waitingAudio = new Audio(WAITING_BGM_SRC);
    waitingAudio.loop = true;
    waitingAudio.preload = "auto";
    waitingAudio.volume = BGM_VOLUME;

    const playingAudio = new Audio(PLAYING_BGM_SRC);
    playingAudio.loop = true;
    playingAudio.preload = "auto";
    playingAudio.volume = BGM_VOLUME;

    lobbyBgmRef.current = lobbyAudio;
    waitingBgmRef.current = waitingAudio;
    playingBgmRef.current = playingAudio;
    lobbyAudio.load();
    waitingAudio.load();
    playingAudio.load();
    void switchBgmTrack(desiredBgmTrackRef.current);

    return () => {
      lobbyAudio.pause();
      waitingAudio.pause();
      playingAudio.pause();
      lobbyAudio.currentTime = 0;
      waitingAudio.currentTime = 0;
      playingAudio.currentTime = 0;
      lobbyBgmRef.current = null;
      waitingBgmRef.current = null;
      playingBgmRef.current = null;
      activeBgmTrackRef.current = null;
    };
  }, [switchBgmTrack]);

  useEffect(() => {
    const sfxEntries = Object.entries(SFX_SOURCES) as [SfxKey, string][];
    const loaded: Partial<Record<SfxKey, HTMLAudioElement>> = {};
    sfxEntries.forEach(([key, src]) => {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = SFX_VOLUME[key];
      audio.load();
      loaded[key] = audio;
    });
    sfxMapRef.current = loaded;

    return () => {
      Object.values(loaded).forEach((audio) => {
        audio?.pause();
        if (audio) audio.currentTime = 0;
      });
      sfxMapRef.current = {};
    };
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      audioUnlockedRef.current = true;
      void switchBgmTrack(desiredBgmTrackRef.current);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [switchBgmTrack]);

  useEffect(() => {
    const playButtonClickSfx = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        playSfx("uiClick");
      }
    };
    window.addEventListener("click", playButtonClickSfx, true);
    return () => {
      window.removeEventListener("click", playButtonClickSfx, true);
    };
  }, [playSfx]);

  useEffect(() => {
    if (!room) {
      previousRoomStatusRef.current = null;
      setShowStarterCoin(false);
      setStarterRole(null);
      return;
    }

    const prevStatus = previousRoomStatusRef.current;
    if (prevStatus === "waiting" && room.status === "playing") {
      playSfx("gameStart");
      if (userId && room.lead_player_id) {
        setStarterRole(room.lead_player_id === userId ? "lead" : "follow");
        setShowStarterCoin(true);
      }
    }
    if (prevStatus === "playing" && room.status === "finished") {
      if (!room.winner_id) {
        playSfx("draw");
      } else if (userId && room.winner_id === userId) {
        playSfx("victory");
      } else {
        playSfx("defeat");
      }
    }
    previousRoomStatusRef.current = room.status;
  }, [room, userId, playSfx]);

  useEffect(() => {
    if (!showStarterCoin) return;
    const t = setTimeout(() => {
      setShowStarterCoin(false);
    }, Math.round(STARTER_COIN_SPIN_DURATION_SEC * 1000) + STARTER_COIN_RESULT_HOLD_MS);
    return () => clearTimeout(t);
  }, [showStarterCoin]);

  useEffect(() => {
    if (notice && notice !== previousNoticeRef.current) {
      playSfx("readyConfirm");
    }
    previousNoticeRef.current = notice;
  }, [notice, playSfx]);

  useEffect(() => {
    if (error && error !== previousErrorRef.current) {
      playSfx("error");
    }
    previousErrorRef.current = error;
  }, [error, playSfx]);

  const myRole = useMemo(() => {
    if (!room || !userId) return null;
    if (room.host_id === userId) return "host";
    if (room.guest_id === userId) return "guest";
    return null;
  }, [room, userId]);

  const hostName = room?.host_id ? profiles[room.host_id] ?? "호스트" : "호스트";
  const guestName = room?.guest_id ? profiles[room.guest_id] ?? "게스트" : "게스트";
  const hostRecord = useMemo(() => {
    if (!room) return null;
    return profileRecords[room.host_id] ?? null;
  }, [room, profileRecords]);
  const guestRecord = useMemo(() => {
    if (!room?.guest_id) return null;
    return profileRecords[room.guest_id] ?? null;
  }, [room, profileRecords]);
  const revealedRoundRows = useMemo(() => {
    if (!room || room.status !== "finished") return [];
    const roundNumbers = [...new Set([...rounds.map((r) => r.round_number), ...revealedRows.map((r) => r.round_number)])].sort((a, b) => a - b);
    return roundNumbers.map((roundNo) => {
      const hostTile = revealedRows.find((r) => r.round_number === roundNo && r.player_id === room.host_id)?.tile ?? null;
      const guestTile = room.guest_id
        ? revealedRows.find((r) => r.round_number === roundNo && r.player_id === room.guest_id)?.tile ?? null
        : null;
      const roundResult = rounds.find((r) => r.round_number === roundNo)?.result ?? null;
      return { roundNo, hostTile, guestTile, roundResult };
    });
  }, [room, rounds, revealedRows]);
  const currentRoundResult = useMemo(() => {
    if (!room || room.current_round <= 0) return null;
    return rounds.find((r) => r.round_number === room.current_round)?.result ?? null;
  }, [room, rounds]);
  const finishedByForfeit = useMemo(() => {
    if (!room || room.status !== "finished") return false;
    if (!room.winner_id) return false;
    return currentRoundResult === null;
  }, [room, currentRoundResult]);

  const myScore = useMemo(() => {
    if (!room || !myRole) return 0;
    return myRole === "host" ? room.host_score : room.guest_score;
  }, [room, myRole]);

  const opponentScore = useMemo(() => {
    if (!room || !myRole) return 0;
    return myRole === "host" ? room.guest_score : room.host_score;
  }, [room, myRole]);

  const myUsedTiles = useMemo(() => mySubmissions.map((s) => s.tile), [mySubmissions]);
  const myAvailableTiles = useMemo(() => ALL_TILES.filter((tile) => !myUsedTiles.includes(tile)), [myUsedTiles]);

  const myTurn = useMemo(() => {
    if (!room || !currentRound || !userId) return false;
    if (room.status !== "playing") return false;
    if (room.round_phase === "await_lead") {
      return currentRound.lead_player_id === userId;
    }
    if (room.round_phase === "await_follow") {
      return currentRound.follow_player_id === userId;
    }
    return false;
  }, [room, currentRound, userId]);

  const submittedThisRound = useMemo(() => {
    if (!room) return false;
    return mySubmissions.some((s) => s.round_number === room.current_round);
  }, [mySubmissions, room]);

  const myResultText = useMemo(() => {
    if (!room || room.status !== "finished" || !userId) return "";
    if (!room.winner_id) return "무승부";
    return room.winner_id === userId ? "승리!" : "패배...";
  }, [room, userId]);
  const myNickname = useMemo(() => {
    if (!userId) return "";
    return profiles[userId] ?? authNickname.trim();
  }, [userId, profiles, authNickname]);

  const clearRoomScopedState = useCallback(() => {
    latestRoundsFetchSeqRef.current += 1;
    latestSubmissionsFetchSeqRef.current += 1;
    roomRef.current = null;
    emptyRoomReadCountRef.current = 0;
    setRoom(null);
    setRounds([]);
    setMySubmissions([]);
    setRevealedRows([]);
    setRevealsLoadedForRoomId(null);
    setLastRoomSnapshot(null);
  }, []);

  const clearAuthScopedState = useCallback(() => {
    userIdRef.current = null;
    emptyRoomReadCountRef.current = 0;
    setProfiles({});
    setRecord({ total: 0, wins: 0, losses: 0, winRate: 0 });
    setProfileRecords({});
    clearRoomScopedState();
    setLeaveConfirmOpen(false);
  }, [clearRoomScopedState]);

  const clearSupabasePersistedSession = useCallback(() => {
    if (typeof window === "undefined") return;
    const purge = (storage: Storage) => {
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (key === "supabase.auth.token" || key.includes("auth-token")) {
          storage.removeItem(key);
        }
      }
    };
    purge(window.localStorage);
    purge(window.sessionStorage);
  }, []);

  const stripAuthCallbackParams = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let changed = false;

    const authParams = ["code", "state", "error", "error_code", "error_description"];
    authParams.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    if (
      url.hash.includes("access_token") ||
      url.hash.includes("refresh_token") ||
      url.hash.includes("expires_at") ||
      url.hash.includes("token_type")
    ) {
      url.hash = "";
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const loadMyRecord = async (uid: string, authSyncSeq?: number) => {
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from("bw_profiles")
      .select("wins,losses")
      .eq("id", uid)
      .maybeSingle();
    if (authSyncSeq !== undefined && authSyncSeq !== authSyncSeqRef.current) return;

    if (profileError || !data) {
      setRecord({ total: 0, wins: 0, losses: 0, winRate: 0 });
      return;
    }

    const wins = Number(data.wins ?? 0);
    const losses = Number(data.losses ?? 0);
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    setRecord({ total, wins, losses, winRate });
  };

  const loadProfiles = async (ids: string[]) => {
    if (!supabase || ids.length === 0) return;
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const { data } = await supabase.from("bw_profiles").select("id,nickname,wins,losses").in("id", uniqueIds);
    if (!data) return;

    const mapped: Record<string, string> = {};
    const recordMapped: Record<string, PlayerRecord> = {};
    (data as ProfileRow[]).forEach((row) => {
      mapped[row.id] = row.nickname;
      const wins = Number(row.wins ?? 0);
      const losses = Number(row.losses ?? 0);
      const total = wins + losses;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      recordMapped[row.id] = { total, wins, losses, winRate };
    });
    setProfiles((prev) => ({ ...prev, ...mapped }));
    setProfileRecords((prev) => ({ ...prev, ...recordMapped }));
  };

  const loadFinishedRoundReveals = async (roomId: string) => {
    if (!supabase) return;
    const { data, error: revealError } = await supabase.rpc("bw_get_room_reveals", {
      p_room_id: roomId,
    });
    if (revealError || !data) {
      setRevealedRows([]);
      setRevealsLoadedForRoomId(roomId);
      return;
    }
    setRevealedRows(data as RoomRevealRow[]);
    setRevealsLoadedForRoomId(roomId);
  };

  const loadRounds = async (roomId: string) => {
    if (!supabase) return;
    const fetchSeq = ++latestRoundsFetchSeqRef.current;
    const isObsolete = () =>
      fetchSeq !== latestRoundsFetchSeqRef.current || roomRef.current?.id !== roomId;

    const query = supabase
      .from("bw_rounds_public")
      .select("id,room_id,round_number,lead_player_id,follow_player_id,lead_submitted,follow_submitted,lead_tile_color,follow_tile_color,result,winner_id")
      .eq("room_id", roomId);

    const { data, error: roundError } = await query.order("round_number", { ascending: true });
    if (isObsolete()) return;

    if (roundError && roundError.message.toLowerCase().includes("lead_tile_color")) {
      const { data: fallbackData } = await supabase
        .from("bw_rounds_public")
        .select("id,room_id,round_number,lead_player_id,follow_player_id,lead_submitted,follow_submitted,result,winner_id")
        .eq("room_id", roomId)
        .order("round_number", { ascending: true });
      if (isObsolete()) return;

      if (fallbackData) {
        const normalized = (fallbackData as BwRoundPublic[]).map((row) => ({
          ...row,
          lead_tile_color: null,
          follow_tile_color: null,
        }));
        setRounds(normalized);
      }
      return;
    }

    if (data) setRounds(data as BwRoundPublic[]);
  };

  const loadMySubmissions = async (roomId: string) => {
    const currentUserId = userIdRef.current;
    if (!supabase || !currentUserId) return;
    const fetchSeq = ++latestSubmissionsFetchSeqRef.current;

    const { data } = await supabase
      .from("bw_submissions")
      .select("id,room_id,round_number,player_id,tile")
      .eq("room_id", roomId)
      .eq("player_id", currentUserId)
      .order("round_number", { ascending: true });
    if (fetchSeq !== latestSubmissionsFetchSeqRef.current) return;
    if (roomRef.current?.id !== roomId) return;
    if (userIdRef.current !== currentUserId) return;

    if (data) setMySubmissions(data as BwSubmission[]);
  };

  const handleRoomSync = async (nextRoom: BwRoom) => {
    const currentRoom = roomRef.current;
    if (currentRoom && currentRoom.id === nextRoom.id) {
      const currentUpdatedAt = Date.parse(currentRoom.updated_at);
      const nextUpdatedAt = Date.parse(nextRoom.updated_at);
      if (Number.isFinite(currentUpdatedAt) && Number.isFinite(nextUpdatedAt) && nextUpdatedAt < currentUpdatedAt) {
        return;
      }
    }

    emptyRoomReadCountRef.current = 0;
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    await loadProfiles([nextRoom.host_id, nextRoom.guest_id ?? ""]);
    if (nextRoom.status !== "finished") {
      setRevealedRows([]);
      setRevealsLoadedForRoomId(null);
    }
    await Promise.all([
      loadRounds(nextRoom.id),
      loadMySubmissions(nextRoom.id),
      nextRoom.status === "finished" ? loadFinishedRoundReveals(nextRoom.id) : Promise.resolve(),
    ]);
  };

  const loadLatestRoom = async (uid: string, authSyncSeq?: number) => {
    if (!supabase) return;
    const isObsolete = () =>
      uid !== userIdRef.current || (authSyncSeq !== undefined && authSyncSeq !== authSyncSeqRef.current);
    const roomSelect =
      "id,room_code,host_id,guest_id,guest_ready,status,current_round,round_phase,lead_player_id,host_score,guest_score,winner_id,updated_at";
    const currentRoomId = roomRef.current?.id ?? null;
    const localRoom = roomRef.current;

    if (currentRoomId) {
      const { data: currentRoomData } = await supabase
        .from("bw_rooms")
        .select(roomSelect)
        .eq("id", currentRoomId)
        .maybeSingle();
      if (isObsolete()) return;
      if (currentRoomData) {
        const latestById = currentRoomData as BwRoom;
        if (!localRoom || localRoom.id !== latestById.id) {
          await handleRoomSync(latestById);
          return;
        }

        const localUpdatedAt = Date.parse(localRoom.updated_at);
        const latestUpdatedAt = Date.parse(latestById.updated_at);
        if (
          !Number.isFinite(localUpdatedAt) ||
          !Number.isFinite(latestUpdatedAt) ||
          latestUpdatedAt > localUpdatedAt
        ) {
          await handleRoomSync(latestById);
          return;
        }

        if (localRoom.status !== "finished") {
          return;
        }
      }
    }

    const statusFilter = localRoom?.status === "finished" ? ["playing", "waiting", "finished"] : ["playing", "waiting"];
    const { data } = await supabase
      .from("bw_rooms")
      .select(roomSelect)
      .or(`host_id.eq.${uid},guest_id.eq.${uid}`)
      .in("status", statusFilter)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isObsolete()) return;

    if (data) {
      await handleRoomSync(data as BwRoom);
      return;
    }

    if (roomRef.current) {
      emptyRoomReadCountRef.current += 1;
      if (emptyRoomReadCountRef.current < 2) {
        return;
      }
    }

    clearRoomScopedState();
  };

  useEffect(() => {
    if (!supabase) {
      setError("Supabase 환경변수가 없습니다. .env.local을 설정해 주세요.");
      return;
    }
    if (authLoading) return;

    const authSyncSeq = ++authSyncSeqRef.current;
    const uid = userId;

    if (!uid) {
      clearSupabasePersistedSession();
      clearAuthScopedState();
      stripAuthCallbackParams();
      return;
    }

    userIdRef.current = uid;
    if (!cleanupTriggeredUsersRef.current.has(uid)) {
      cleanupTriggeredUsersRef.current.add(uid);
      void supabase.rpc("bw_cleanup_stale_finished_rooms").then(({ error: cleanupError }) => {
        if (cleanupError && cleanupError.code !== "42883" && cleanupError.code !== "PGRST202") {
          console.warn("stale room cleanup failed", cleanupError.message);
        }
      });
    }

    void (async () => {
      await loadMyRecord(uid, authSyncSeq);
      await loadLatestRoom(uid, authSyncSeq);
      stripAuthCallbackParams();
    })();
  }, [
    authLoading,
    userId,
    clearAuthScopedState,
    clearSupabasePersistedSession,
    stripAuthCallbackParams,
  ]);

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
    if (!supabase || !room) return;
    const client = supabase;
    setRealtimeSubscribed(false);
    const uid = userId;
    if (!uid) return;

    const channel = client
      .channel(`bw-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bw_rooms", filter: `id=eq.${room.id}` },
        async (payload) => {
          const next = payload.new as BwRoom | null;
          if (next?.id) {
            await handleRoomSync(next);
          } else {
            await loadLatestRoom(uid);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bw_rounds_public", filter: `room_id=eq.${room.id}` },
        async () => {
          await Promise.all([loadRounds(room.id), loadLatestRoom(uid)]);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bw_submissions", filter: `room_id=eq.${room.id}` },
        async () => {
          await Promise.all([loadMySubmissions(room.id), loadRounds(room.id), loadLatestRoom(uid)]);
        }
      )
      .subscribe((status) => {
        setRealtimeSubscribed(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void loadLatestRoom(uid);
        }
      });

    return () => {
      setRealtimeSubscribed(false);
      client.removeChannel(channel);
    };
  }, [room?.id, userId]);

  useEffect(() => {
    if (!room || room.status !== "playing") return;
    const uid = userIdRef.current;

    void Promise.all([loadRounds(room.id), uid ? loadLatestRoom(uid) : Promise.resolve()]);
    const refreshIntervalMs = isPageVisible ? 800 : 2000;
    const t = setInterval(() => {
      void Promise.all([loadRounds(room.id), uid ? loadLatestRoom(uid) : Promise.resolve()]);
    }, refreshIntervalMs);

    return () => clearInterval(t);
  }, [room?.id, room?.status, isPageVisible]);

  useEffect(() => {
    if (!room) return;
    if (!lastRoomSnapshot) {
      setLastRoomSnapshot(room);
      return;
    }

    const justFinishedWithWinner =
      lastRoomSnapshot.status === "playing" &&
      room.status === "finished" &&
      Boolean(room.winner_id);

    if (justFinishedWithWinner && userId && room.winner_id === userId && finishedByForfeit) {
      setNotice("상대 플레이어가 기권했습니다. 종료 화면에서 라운드 숫자를 확인할 수 있습니다.");
      setLeaveConfirmOpen(false);
    }

    setLastRoomSnapshot(room);
  }, [room, userId, lastRoomSnapshot, finishedByForfeit]);

  useEffect(() => {
    if (!userId || !room) return;
    const waitingRoom = room.status === "waiting";
    const finishedRoom = room.status === "finished";
    if (!waitingRoom && !finishedRoom && realtimeSubscribed && isPageVisible) return;

    loadLatestRoom(userId);
    loadMyRecord(userId);

    const refreshIntervalMs = waitingRoom || finishedRoom ? 1000 : 5000;
    const t = setInterval(() => {
      loadLatestRoom(userId);
      loadMyRecord(userId);
    }, refreshIntervalMs);

    return () => clearInterval(t);
  }, [userId, room?.id, room?.status, room?.guest_id, realtimeSubscribed, isPageVisible]);

  useEffect(() => {
    if (!room || room.status !== "finished") {
      setShowVerdict(false);
      return;
    }

    setShowVerdict(true);
    const t = setTimeout(() => {
      setShowVerdict(false);
    }, 2600);

    return () => clearTimeout(t);
  }, [room?.status, room?.winner_id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const formatNicknameError = (raw: string, code?: string) => {
    const lower = raw.toLowerCase();
    if (code === "23505" || lower.includes("duplicate key value") || lower.includes("bw_profiles_nickname")) {
      return "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.";
    }
    if (lower.includes("char_length") || lower.includes("check constraint")) {
      return "닉네임은 2~20자로 입력해 주세요.";
    }
    return raw;
  };

  const formatRoomActionError = (raw: string) => {
    if (raw.includes("GUEST_NOT_JOINED")) return "게스트가 아직 입장하지 않았습니다.";
    if (raw.includes("GUEST_NOT_READY")) return "게스트 준비 전입니다. 게스트가 준비 버튼을 누른 후 다시 시작해 주세요.";
    if (raw.includes("ONLY_HOST_CAN_START")) return "호스트만 게임을 시작할 수 있습니다.";
    if (raw.includes("ROOM_ALREADY_STARTED")) return "이미 시작된 게임입니다.";
    if (raw.includes("ROOM_NOT_FOUND")) return "방을 찾을 수 없습니다. 방 목록을 새로고침해 주세요.";
    return raw;
  };

  const createRoom = async () => {
    if (!supabase) return;
    const displayNickname = myNickname.trim();
    if (!displayNickname) {
      setError("닉네임이 필요합니다. 랜딩 페이지에서 닉네임 설정을 먼저 완료해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    const code = makeRoomCode();
    const { data, error: createError } = await supabase.rpc("bw_create_room", {
      p_room_code: code,
      p_nickname: displayNickname,
    });

    if (createError) {
      setError(formatNicknameError(createError.message));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as BwRoom);
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!supabase) return;
    const displayNickname = myNickname.trim();
    if (!displayNickname || roomCodeInput.trim().length !== 6) {
      setError("닉네임 설정과 6자리 방 코드를 확인해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: joinError } = await supabase.rpc("bw_join_room", {
      p_room_code: roomCodeInput.trim().toUpperCase(),
      p_nickname: displayNickname,
    });

    if (joinError) {
      setError(formatNicknameError(joinError.message));
      setLoading(false);
      return;
    }

    await handleRoomSync(data as BwRoom);
    setLoading(false);
  };

  const setGuestReady = async (ready: boolean) => {
    if (!supabase || !room) return;
    setLoading(true);
    setError("");
    const { data, error: readyError } = await supabase.rpc("bw_set_guest_ready", {
      p_room_id: room.id,
      p_ready: ready,
    });
    if (readyError) {
      setError(readyError.message);
      setLoading(false);
      return;
    }
    if (data) {
      await handleRoomSync(data as BwRoom);
      playSfx("readyConfirm");
    }
    setLoading(false);
  };

  const startGame = async () => {
    if (!supabase || !room) return;
    const uid = userIdRef.current;
    if (!uid) return;

    setLoading(true);
    setError("");
    setNotice("");

    // Start 직전에 최신 room 상태를 강제로 동기화해 stale UI로 인한 무반응을 방지.
    await loadLatestRoom(uid);
    const latestRoom = roomRef.current;
    if (!latestRoom || latestRoom.id !== room.id) {
      setError("방 상태를 다시 확인해 주세요.");
      setLoading(false);
      return;
    }
    if (!latestRoom.guest_id) {
      setError("게스트가 아직 입장하지 않았습니다.");
      setLoading(false);
      return;
    }
    if (!latestRoom.guest_ready) {
      setError("게스트 준비 전입니다. 게스트가 준비 버튼을 누른 후 다시 시작해 주세요.");
      setLoading(false);
      return;
    }

    const { data, error: startError } = await supabase.rpc("bw_start_game", { p_room_id: room.id });
    if (startError) {
      setError(formatRoomActionError(startError.message));
      setLoading(false);
      return;
    }
    if (data) {
      await handleRoomSync(data as BwRoom);
    }
    setLoading(false);
  };

  const submitTile = async (tile: number) => {
    if (!supabase || !room || !myTurn || submittedThisRound) return;

    setFlyingTile(tile);
    playSfx("tileSubmit");
    setTimeout(() => setFlyingTile(null), 560);

    setLoading(true);
    setError("");
    const { data, error: submitError } = await supabase.rpc("bw_submit_tile", {
      p_room_id: room.id,
      p_tile: tile,
    });
    if (submitError) {
      setError(submitError.message);
      setLoading(false);
      return;
    }
    if (data) {
      await handleRoomSync(data as BwRoom);
    }
    setLoading(false);
  };

  const resetRoom = async () => {
    if (!supabase || !room) return;
    setLoading(true);
    setError("");
    const { data, error: resetError } = await supabase.rpc("bw_reset_room", {
      p_room_id: room.id,
    });
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }
    if (data) {
      await handleRoomSync(data as BwRoom);
      playSfx("readyConfirm");
    }
    setLoading(false);
  };

  const leaveRoom = async () => {
    if (!supabase || !room || !userId) return;

    const isPlaying = room.status === "playing";

    setLoading(true);
    setError("");
    setNotice("");

    const { error: leaveError } = await supabase.rpc("bw_leave_room", {
      p_room_id: room.id,
    });
    if (leaveError) {
      const normalizedError = leaveError.message.trim().toUpperCase();
      if (normalizedError.includes("ROOM_NOT_FOUND")) {
        setLeaveConfirmOpen(false);
        clearRoomScopedState();
        playSfx("leave");
        setNotice(isPlaying ? "게임에서 나가 기권 처리되었습니다." : "Room에서 나갔습니다.");
        setLoading(false);
        return;
      }
      if (leaveError.message.toLowerCase().includes("does not exist")) {
        setError("서버에 bw_leave_room 함수가 없습니다. 최신 스키마를 적용해 주세요.");
      } else {
        setError(leaveError.message);
      }
      setLoading(false);
      return;
    }

    setLeaveConfirmOpen(false);
    clearRoomScopedState();
    playSfx("leave");
    setNotice(isPlaying ? "게임에서 나가 기권 처리되었습니다." : "Room에서 나갔습니다.");
    setLoading(false);
  };

  const leaveFinishedGameToLobby = async () => {
    await leaveRoom();
  };

  if (!supabase) {
    return <div className="p-6 text-red-300">Supabase 설정이 없어 실행할 수 없습니다.</div>;
  }

  const getPlayerTileColor = (round: BwRoundPublic, playerId: string | null): "black" | "white" | null => {
    if (!playerId) return null;
    if (round.lead_player_id === playerId) return round.lead_tile_color;
    if (round.follow_player_id === playerId) return round.follow_tile_color;
    return null;
  };

  const getRoundResultBorder = (round: BwRoundPublic, playerId: string | null) => {
    if (!playerId || !round.result) return "border-slate-500/60";
    if (!round.winner_id) return "border-slate-400/70";
    return round.winner_id === playerId ? "border-green-500/95" : "border-red-500/95";
  };

  const getTileColorClass = (tile: number | null) => {
    if (tile === null) return "border-slate-500/60 bg-slate-500/45 text-slate-300";
    return tileColor(tile) === "black"
      ? "border-slate-700 bg-slate-950 text-slate-100"
      : "border-slate-200 bg-slate-100 text-slate-900";
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 rounded-2xl border border-red-900/50 bg-black/40 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-wide md:text-4xl">🍙 흑과 백</h1>
              <p className="mt-2 text-sm text-red-100/75">1:1 리얼타임 한판승부 | 9라운드 | 5승 선취 즉시 종료</p>
            </div>
            {!userId ? (
              <Link href={entryHref} className="rounded-lg border border-red-200/30 px-3 py-1.5 text-sm">
                BoardHub
              </Link>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-5">
                  <span className="text-sm text-red-100">{myNickname || "플레이어"}님 환영합니다!✋</span>
                  <Link href={entryHref} className="rounded-lg border border-red-200/30 px-3 py-1.5 text-sm">
                    BoardHub
                  </Link>
                </div>
                <p className="mt-2 text-sm text-red-100/85">
                  {record.total}전 {record.wins}승 {record.losses}패 ({record.winRate}%)
                </p>
              </div>
            )}
          </div>
        </header>

        {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-950/40 p-3 text-sm text-emerald-200"
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
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
            >
              <motion.div
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 14, opacity: 0 }}
                className="w-full max-w-md rounded-xl border border-red-900/50 bg-slate-950 p-5"
              >
                <div className="mb-3">
                  <h3 className="text-lg font-bold">정말 나가시겠어요?</h3>
                </div>
                <p className="mb-4 text-sm text-red-100/85">
                  {room.status === "playing"
                    ? "지금 나가면 즉시 기권 처리되며, 상대 승리로 게임이 종료됩니다."
                    : "방에서 나가면 Room Lobby로 돌아갑니다."}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaveConfirmOpen(false)}
                    disabled={loading}
                    className="rounded-lg border border-red-100/30 px-4 py-2 text-sm text-red-100 disabled:opacity-60"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={leaveRoom}
                    disabled={loading}
                    className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
                  >
                    나가기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!authLoading && !userId && (
          <section className="rounded-2xl border border-red-900/50 bg-black/45 p-6 text-center backdrop-blur-md">
            <h2 className="text-xl font-bold">로그인이 필요합니다.</h2>
            <p className="mt-3 text-sm text-red-100/80">랜딩 페이지에서 로그인한 뒤 다시 이 게임으로 입장해 주세요.</p>
            <Link
              href={entryHref}
              className="mt-5 inline-flex rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-black"
            >
              랜딩으로 이동
            </Link>
          </section>
        )}

        {userId && profileLoading && (
          <section className="mb-4 rounded-2xl border border-red-900/50 bg-black/45 p-5 backdrop-blur-md">
            <h2 className="text-xl font-bold">닉네임 확인 중</h2>
            <p className="mt-3 text-sm text-red-100/80">랜딩에서 저장한 닉네임 정보를 불러오고 있습니다.</p>
          </section>
        )}

        {userId && !profileLoading && requiresNickname && (
          <section className="mb-4 rounded-2xl border border-red-900/50 bg-black/45 p-5 backdrop-blur-md">
            <h2 className="text-xl font-bold">닉네임 설정이 필요합니다.</h2>
            <p className="mt-3 text-sm text-red-100/80">닉네임 설정은 랜딩 페이지에서 진행합니다. 닉네임을 저장한 뒤 다시 입장해 주세요.</p>
            <Link
              href={entryHref}
              className="mt-5 inline-flex rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-black"
            >
              랜딩으로 이동
            </Link>
          </section>
        )}

        {userId && !profileLoading && !requiresNickname && !inRoom && (
          <section className="rounded-2xl border border-red-900/50 bg-black/45 p-5 backdrop-blur-md">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Room Lobby</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={createRoom}
                disabled={loading}
                className="rounded-xl bg-red-500 px-4 py-3 text-lg font-bold text-black disabled:opacity-60"
              >
                방 만들기
              </button>

              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-red-900/60 bg-black/40 px-3 py-2 uppercase"
                  placeholder="방 코드 6자리"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={joinRoom}
                  disabled={loading}
                  className="rounded-lg bg-red-500 px-4 py-2 font-bold text-black disabled:opacity-60"
                >
                  입장
                </button>
              </div>
            </div>
          </section>
        )}

        {userId && !profileLoading && !requiresNickname && room && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-red-900/50 bg-black/45 p-5 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-red-100/70">ROOM CODE</p>
                  <p className="text-2xl font-black tracking-[0.2em] text-red-100">{room.room_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-red-100/70">STATUS</p>
                  <p className="font-bold uppercase">{room.status}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div
                  className={`rounded-xl bg-black/35 p-3 ${room.status === "waiting" && room.host_id
                    ? "border-2 border-white/90"
                    : "border border-red-900/40"
                    }`}
                >
                  <p className="text-sm text-red-100/70">호스트</p>
                  <p className="text-lg font-bold">{hostName}</p>
                  <p className="text-sm">점수 {room.host_score}</p>
                  {room.status === "waiting" && hostRecord && (
                    <p className="mt-1 text-xs text-red-100/80">
                      전적 {hostRecord.total}전 {hostRecord.wins}승 {hostRecord.losses}패 ({hostRecord.winRate}%)
                    </p>
                  )}
                </div>
                <div
                  className={`rounded-xl bg-black/35 p-3 ${room.status === "waiting" && room.guest_id
                    ? "border-2 border-white/90"
                    : "border border-red-900/40"
                    }`}
                >
                  <p className="text-sm text-red-100/70">게스트</p>
                  <p className="text-lg font-bold">{guestName}</p>
                  <p className="text-sm">점수 {room.guest_score}</p>
                  {room.status === "waiting" && guestRecord && (
                    <p className="mt-1 text-xs text-red-100/80">
                      전적 {guestRecord.total}전 {guestRecord.wins}승 {guestRecord.losses}패 ({guestRecord.winRate}%)
                    </p>
                  )}
                </div>
              </div>

              {room.status === "waiting" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {myRole === "guest" && (
                    <button
                      type="button"
                      onClick={() => setGuestReady(!room.guest_ready)}
                      className="rounded-lg bg-emerald-400 px-4 py-2 font-bold text-black"
                    >
                      {room.guest_ready ? "준비 취소" : "준비"}
                    </button>
                  )}

                  {myRole === "host" && (
                    <button
                      type="button"
                      onClick={startGame}
                      disabled={!room.guest_id || !room.guest_ready}
                      className="rounded-lg bg-red-500 px-4 py-2 font-bold text-black disabled:opacity-40"
                    >
                      게임 시작
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setLeaveConfirmOpen(true)}
                    className="rounded-lg border border-red-100/40 px-4 py-2"
                  >
                    Room 나가기
                  </button>
                </div>
              )}
            </div>

            {room.status === "playing" && (
              <div className="rounded-2xl border border-red-900/50 bg-black/50 p-5 backdrop-blur-md">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-lg font-bold">라운드 {room.current_round} / 9</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black tracking-wider">{myScore} : {opponentScore}</p>
                    <button
                      type="button"
                      onClick={() => setLeaveConfirmOpen(true)}
                      disabled={loading}
                      className="rounded-lg border border-red-100/40 px-3 py-1.5 text-sm disabled:opacity-60"
                    >
                      기권 후 나가기
                    </button>
                  </div>
                </div>
                <div className="mt-5 rounded-xl border border-slate-500/60 bg-slate-700/40 p-3 text-sm">
                  <p className="mb-2 font-bold">실시간 제출 색상 보드</p>
                  <div className="space-y-2 text-red-100/80">
                    {[
                      { key: "opponent", label: "상대 타일", playerId: (myRole === "host" ? room.guest_id : room.host_id) ?? null },
                      { key: "me", label: "내 타일", playerId: userId },
                    ].map(({ key, label, playerId }) => (
                      <div key={`live-color-row-${key}`} className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] gap-1">
                        <p className="text-xs font-bold">{label}</p>
                        {ALL_TILES.map((roundNo) => {
                          const round = rounds.find((r) => r.round_number === roundNo);
                          const resultBorder = round ? getRoundResultBorder(round, playerId) : "border-slate-500/60";
                          const color = round ? getPlayerTileColor(round, playerId) : null;
                          return (
                            <div
                              key={`${key}-color-${roundNo}`}
                              className={`h-6 rounded border-4 ${color === "black"
                                ? `bg-slate-950 ${resultBorder}`
                                : color === "white"
                                  ? `bg-slate-100 ${resultBorder}`
                                  : "border-slate-500/60 bg-slate-500/45"
                                }`}
                              title={color ? `${roundNo}라운드: ${color}` : `${roundNo}라운드: 미제출`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 mb-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-red-900/40 bg-black/35 p-3 text-sm">
                    <p>선 플레이어 제출: {currentRound?.lead_submitted ? "완료" : "대기"}</p>
                    <p>후 플레이어 제출: {currentRound?.follow_submitted ? "완료" : "대기"}</p>
                  </div>
                  <div className="rounded-xl border border-red-900/40 bg-black/35 p-3 text-sm">
                    <p>{myTurn && !submittedThisRound ? "당신 차례입니다!" : "상대 차례입니다!"}</p>
                    <p>내 사용 타일: {myUsedTiles.length} / 9</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 md:grid-cols-9">
                  {ALL_TILES.map((tile) => {
                    const isAvailable = myAvailableTiles.includes(tile);
                    const canPlay = isAvailable && myTurn && !submittedThisRound;
                    return (
                      <motion.button
                        whileHover={canPlay ? { y: -4 } : undefined}
                        whileTap={canPlay ? { scale: 0.95 } : undefined}
                        key={tile}
                        type="button"
                        onClick={() => submitTile(tile)}
                        disabled={!canPlay || loading}
                        className={`rounded-xl border p-3 text-center text-2xl font-black transition ${isAvailable ? tileClass(tile) : "cursor-not-allowed border-red-950/60 bg-black/60 text-red-100/30"
                          }`}
                      >
                        {isAvailable ? tile : "X"}
                      </motion.button>
                    );
                  })}
                </div>



                <div className="mt-3 rounded-xl border border-red-900/40 bg-black/35 p-3 text-sm">
                  <p className="mb-2 font-bold">공개 라운드 로그 (숫자 비공개)</p>
                  <div className="space-y-1 text-red-100/80">
                    {rounds
                      .filter((r) => r.result)
                      .map((r) => (
                        <p key={r.id}>
                          R{r.round_number}: {r.result === "DRAW" ? "무승부" : r.result === "HOST_WIN" ? `${hostName} 승` : `${guestName} 승`}
                        </p>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {room.status === "finished" && (
              <div className="rounded-2xl border border-red-900/50 bg-black/50 p-5 backdrop-blur-md">
                <p className="text-lg font-bold">게임 종료</p>
                <p className="mt-1 text-red-100/80">
                  최종 점수 {room.host_score} : {room.guest_score}
                </p>
                <div className="mt-3 rounded-xl border border-slate-500/60 bg-slate-700/40 p-3 text-sm">
                  <p className="mb-2 font-bold">라운드별 숫자 공개</p>
                  <div className="space-y-2 text-red-100/80">
                    {revealedRoundRows.length === 0 && <p>공개할 라운드 데이터가 없습니다.</p>}
                    {revealedRoundRows.length > 0 && (
                      <>
                        {(myRole === "host"
                          ? [
                            { key: "guest", label: guestName, playerId: room.guest_id ?? null },
                            { key: "host", label: hostName, playerId: room.host_id },
                          ]
                          : [
                            { key: "host", label: hostName, playerId: room.host_id },
                            { key: "guest", label: guestName, playerId: room.guest_id ?? null },
                          ]
                        ).map(({ key, label, playerId }) => (
                          <div key={`reveal-row-${key}`} className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] gap-1">
                            <p className="text-xs font-bold">{label}</p>
                            {ALL_TILES.map((roundNo) => {
                              const row = revealedRoundRows.find((r) => r.roundNo === roundNo);
                              const round = rounds.find((r) => r.round_number === roundNo);
                              const resultBorder = round ? getRoundResultBorder(round, playerId) : "border-slate-500/60";
                              const tileValue = key === "host" ? row?.hostTile ?? null : row?.guestTile ?? null;
                              const tileClassName = getTileColorClass(tileValue);
                              return (
                                <div
                                  key={`reveal-${key}-${roundNo}`}
                                  className={`h-8 rounded border-4 ${tileClassName} ${resultBorder} flex items-center justify-center text-sm font-black`}
                                  title={tileValue !== null ? `${roundNo}라운드: ${tileValue}` : `${roundNo}라운드: 미제출`}
                                >
                                  {tileValue ?? "-"}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {myRole === "host" && !finishedByForfeit && (
                    <button type="button" onClick={resetRoom} className="rounded-lg bg-red-500 px-4 py-2 font-bold text-black">
                      Room으로 복귀
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={leaveFinishedGameToLobby}
                    className="rounded-lg border border-red-100/40 px-4 py-2"
                  >
                    게임 나가기
                  </button>
                  {myRole === "host" && finishedByForfeit && (
                    <p className="text-sm text-red-100/70">상대가 기권 후 나가 Room으로 복귀할 수 없습니다.</p>
                  )}
                  {myRole !== "host" && (
                    <p className="text-sm text-red-100/70">
                      {finishedByForfeit
                        ? "상대가 기권 후 나가 Room으로 복귀할 수 없습니다."
                        : "호스트가 Room 복귀 버튼을 누르면 다음 게임을 준비할 수 있습니다."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {!userId && (
          <section className="mt-6 rounded-2xl border border-red-900/50 bg-black/45 p-5 backdrop-blur-md">
            <div className="overflow-hidden rounded-xl border border-red-900/40 bg-black/70">
              <Image
                src="/images/landing.jpg"
                alt="Landing"
                width={1200}
                height={720}
                className="w-full rounded-xl border border-red-900/40 object-cover"
              />
            </div>
            <span className="mt-2 block w-full text-right text-xs text-red-100/70">Generated by ChatGPT</span>
          </section>
        )}

        {room?.status !== "playing" && (
          <section className="mt-6 rounded-2xl border border-red-900/50 bg-black/45 p-5 backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">게임 규칙 안내</h3>
              <span className="text-xs text-red-100/70">실전 전 빠르게 확인하세요</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-red-900/40 bg-black/40 p-4">
                <p className="mb-2 text-sm font-semibold text-red-200">타일 구성</p>
                <p className="text-sm text-red-100/85">각 플레이어는 1~9 타일 보유</p>
                <p className="text-sm text-red-100/85">흑색: 2, 4, 6, 8</p>
                <p className="text-sm text-red-100/85">백색: 1, 3, 5, 7, 9</p>
              </div>
              <div className="rounded-xl border border-red-900/40 bg-black/40 p-4">
                <p className="mb-2 text-sm font-semibold text-red-200">승패 규칙</p>
                <p className="text-sm text-red-100/85">큰 숫자가 승리, 승자는 1점 획득</p>
                <p className="text-sm text-red-100/85">예외: 숫자 1은 숫자 9를 이김</p>
                <p className="text-sm text-red-100/85">상대가 낸 숫자는 공개되지 않음</p>
              </div>
              <div className="rounded-xl border border-red-900/40 bg-black/40 p-4">
                <p className="mb-2 text-sm font-semibold text-red-200">라운드 진행</p>
                <p className="text-sm text-red-100/85">총 9라운드, 선/후 순서대로 제출</p>
                <p className="text-sm text-red-100/85">게스트 준비 완료 후 호스트 시작 가능</p>
                <p className="text-sm text-red-100/85">무승부 시 선 플레이어 유지</p>
              </div>
              <div className="rounded-xl border border-red-900/40 bg-black/40 p-4">
                <p className="mb-2 text-sm font-semibold text-red-200">종료 조건</p>
                <p className="text-sm text-red-100/85">5승 선취 시 즉시 게임 종료</p>
                <p className="text-sm text-red-100/85">최대 9라운드 진행</p>
                <p className="text-sm text-red-100/85">종료 후 Room으로 복귀 가능</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <AnimatePresence>{flyingTile !== null && <FlyingTile tile={flyingTile} />}</AnimatePresence>
      <AnimatePresence>{showStarterCoin && starterRole && <StarterCoinOverlay role={starterRole} />}</AnimatePresence>
      <AnimatePresence>{showVerdict && myResultText && <AnimatedVerdict text={myResultText} />}</AnimatePresence>
    </main>
  );
}

function FlyingTile({ tile }: { tile: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 120, scale: 0.8, rotate: -10 }}
      animate={{ opacity: 1, y: -260, scale: 1.05, rotate: 8 }}
      exit={{ opacity: 0, y: -320, scale: 0.9 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2"
    >
      <div className={`rounded-2xl border px-8 py-6 text-5xl font-black shadow-2xl ${tileClass(tile)}`}>{tile}</div>
    </motion.div>
  );
}
