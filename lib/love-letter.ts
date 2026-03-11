export type LlRoomStatus = "waiting" | "playing" | "finished";
export type LlRoundPhase =
  | "dealing"
  | "await_turn"
  | "await_broadcaster_resolution"
  | "round_reveal"
  | "await_next_round"
  | "match_finished";

export type LlCardId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type LlPlayerLimit = 2 | 3 | 4;

export interface LlCardDefinition {
  id: LlCardId;
  key: string;
  name: string;
  englishName: string;
  copies: number;
  summary: string;
  effect: string;
  targetMode: "none" | "other" | "self_or_other";
  needsGuess: boolean;
  imageSrc: string;
  accentClassName: string;
}

export interface LlRoomRow {
  id: string;
  room_code: string;
  host_id: string;
  player_limit: LlPlayerLimit;
  status: LlRoomStatus;
  current_round: number;
  target_token_count: number;
  final_winner_ids: string[];
  last_departed_nickname: string | null;
  updated_at: string;
}

export interface LlRoomPlayerRow {
  room_id: string;
  player_id: string;
  seat_index: number;
  join_order: number;
  ready: boolean;
  token_count: number;
  nickname_snapshot: string;
  left_at: string | null;
  last_active_at: string | null;
  joined_at: string | null;
}

export interface LlActionLogRow {
  id: number;
  room_id: string;
  round_number: number;
  action_type: string;
  actor_id: string | null;
  actor_nickname: string | null;
  target_player_id: string | null;
  target_nickname: string | null;
  card_id: LlCardId | null;
  guessed_card: LlCardId | null;
  public_message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface LlPrivateResult {
  type: "counselor" | "athlete" | "broadcaster" | "notice";
  title?: string;
  message?: string;
  card_id?: LlCardId | null;
  actor_card_id?: LlCardId | null;
  target_card_id?: LlCardId | null;
  loser_player_id?: string | null;
  options?: LlCardId[];
}

export interface LlServerEventRow {
  id: number;
  room_id: string;
  round_number: number;
  player_id: string;
  event_type: string;
  title: string;
  message: string;
  detail: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface LlPendingInput {
  kind: "none" | "resolve_broadcaster";
  pending_card_id: LlCardId | null;
  valid_target_ids: string[];
  valid_guess_card_ids: LlCardId[];
  broadcaster_options: LlCardId[];
}

export interface LlRoomView {
  room_id: string;
  round_number: number;
  round_phase: LlRoundPhase;
  starter_player_id: string | null;
  current_turn_player_id: string | null;
  next_starter_player_id: string | null;
  deck_count: number;
  burned_card_hidden: boolean;
  reveal_all_hands: boolean;
  spectator_mode: boolean;
  my_hand: LlCardId[];
  hand_counts: Record<string, number>;
  discard_piles: Record<string, LlCardId[]>;
  protected_player_ids: string[];
  eliminated_player_ids: string[];
  spectator_player_ids: string[];
  round_winner_ids: string[];
  match_winner_ids: string[];
  tiebreak_sums: Record<string, number>;
  visible_hands: Record<string, LlCardId[]>;
  server_events: LlServerEventRow[];
  recent_private_message: string | null;
  end_reason: string | null;
  logs: LlActionLogRow[];
  pending_input: LlPendingInput;
}

export interface LlSeatPlacement {
  playerId: string;
  relativeSeatIndex: number;
  isSelf: boolean;
  style: {
    left: string;
    top: string;
    transform: string;
  };
}

const EMPTY_PENDING_INPUT: LlPendingInput = {
  kind: "none",
  pending_card_id: null,
  valid_target_ids: [],
  valid_guess_card_ids: [],
  broadcaster_options: [],
};

const EMPTY_VIEW: LlRoomView = {
  room_id: "",
  round_number: 0,
  round_phase: "dealing",
  starter_player_id: null,
  current_turn_player_id: null,
  next_starter_player_id: null,
  deck_count: 0,
  burned_card_hidden: true,
  reveal_all_hands: false,
  spectator_mode: false,
  my_hand: [],
  hand_counts: {},
  discard_piles: {},
  protected_player_ids: [],
  eliminated_player_ids: [],
  spectator_player_ids: [],
  round_winner_ids: [],
  match_winner_ids: [],
  tiebreak_sums: {},
  visible_hands: {},
  server_events: [],
  recent_private_message: null,
  end_reason: null,
  logs: [],
  pending_input: EMPTY_PENDING_INPUT,
};

const CARD_ACCENT_CLASSES: Record<LlCardId, string> = {
  0: "from-sky-200/85 to-cyan-300/70",
  1: "from-rose-300/85 to-orange-300/70",
  2: "from-emerald-200/80 to-teal-300/70",
  3: "from-amber-200/85 to-orange-400/70",
  4: "from-lime-200/80 to-emerald-300/70",
  5: "from-fuchsia-300/80 to-rose-400/70",
  6: "from-violet-300/80 to-indigo-400/70",
  7: "from-amber-200/90 to-yellow-400/75",
  8: "from-slate-200/80 to-zinc-300/70",
  9: "from-red-300/90 to-rose-500/80",
};

export const LOVE_LETTER_CARD_DEFS: Record<LlCardId, LlCardDefinition> = {
  0: {
    id: 0,
    key: "newbie",
    name: "전학생",
    englishName: "Newbie",
    copies: 2,
    summary: "라운드 종료 보너스 토큰",
    effect: "종료 시 혼자만 관련되어 있으면 비밀 폴라로이드 토큰 1개 추가",
    targetMode: "none",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/newbie.png",
    accentClassName: CARD_ACCENT_CLASSES[0],
  },
  1: {
    id: 1,
    key: "monitor",
    name: "선도부원",
    englishName: "Monitor",
    copies: 6,
    summary: "상대 카드 이름 추측",
    effect: "다른 플레이어 1명을 지목해 선도부원을 제외한 카드를 맞히면 즉시 탈락",
    targetMode: "other",
    needsGuess: true,
    imageSrc: "/images/love_letters/characters/monitor.png",
    accentClassName: CARD_ACCENT_CLASSES[1],
  },
  2: {
    id: 2,
    key: "counselor",
    name: "상담 선생님",
    englishName: "Counselor",
    copies: 2,
    summary: "손패 비공개 확인",
    effect: "다른 플레이어 1명의 손패를 나만 본다",
    targetMode: "other",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/counselor.png",
    accentClassName: CARD_ACCENT_CLASSES[2],
  },
  3: {
    id: 3,
    key: "athlete",
    name: "운동부 에이스",
    englishName: "Athlete",
    copies: 2,
    summary: "숫자 비공개 비교",
    effect: "다른 플레이어와 손패 숫자를 비교해 낮은 쪽을 즉시 탈락시킨다",
    targetMode: "other",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/athlete.png",
    accentClassName: CARD_ACCENT_CLASSES[3],
  },
  4: {
    id: 4,
    key: "librarian",
    name: "도서부원",
    englishName: "Librarian",
    copies: 2,
    summary: "다음 턴 전까지 보호",
    effect: "다른 플레이어의 지목형 카드 효과로부터 다음 내 차례 시작 전까지 보호",
    targetMode: "none",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/librarian.png",
    accentClassName: CARD_ACCENT_CLASSES[4],
  },
  5: {
    id: 5,
    key: "vicepres",
    name: "전교 부회장",
    englishName: "VicePres",
    copies: 2,
    summary: "강제 버림 후 재드로우",
    effect: "자신 포함 한 명을 지목해 패를 버리고 새로 1장을 드로우시킨다",
    targetMode: "self_or_other",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/vicepres.png",
    accentClassName: CARD_ACCENT_CLASSES[5],
  },
  6: {
    id: 6,
    key: "broadcaster",
    name: "방송부장",
    englishName: "Broadcaster",
    copies: 2,
    summary: "3장 중 1장 유지",
    effect: "덱에서 2장을 더 보고 3장 중 1장을 남기고 나머지는 원하는 순서로 덱 맨 아래",
    targetMode: "none",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/broadcaster.png",
    accentClassName: CARD_ACCENT_CLASSES[6],
  },
  7: {
    id: 7,
    key: "president",
    name: "전교 회장",
    englishName: "President",
    copies: 1,
    summary: "손패 교환",
    effect: "다른 플레이어 1명과 손패를 강제로 바꾼다",
    targetMode: "other",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/president.png",
    accentClassName: CARD_ACCENT_CLASSES[7],
  },
  8: {
    id: 8,
    key: "scholar",
    name: "전교 1등",
    englishName: "Scholar",
    copies: 1,
    summary: "5, 7과 조합 시 강제 공개",
    effect: "전교 회장이나 전교 부회장과 함께 손패에 확정되면 즉시 공개 카드 더미로 이동",
    targetMode: "none",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/scholar.png",
    accentClassName: CARD_ACCENT_CLASSES[8],
  },
  9: {
    id: 9,
    key: "crush",
    name: "짝사랑",
    englishName: "Crush",
    copies: 1,
    summary: "공개되는 순간 탈락",
    effect: "어떤 이유로든 공개 카드 영역에 놓이면 즉시 라운드 탈락",
    targetMode: "none",
    needsGuess: false,
    imageSrc: "/images/love_letters/characters/crush.png",
    accentClassName: CARD_ACCENT_CLASSES[9],
  },
};

export const LOVE_LETTER_DECK: LlCardId[] = [
  0, 0,
  1, 1, 1, 1, 1, 1,
  2, 2,
  3, 3,
  4, 4,
  5, 5,
  6, 6,
  7,
  8,
  9,
];

export const LOVE_LETTER_PLAYER_LIMITS: LlPlayerLimit[] = [2, 3, 4];

export const LOVE_LETTER_RULE_SUMMARY = [
  {
    title: "목표 토큰",
    body: "2인 7개, 3인 5개, 4인 4개의 비밀 폴라로이드 토큰을 먼저 모으면 승리합니다.",
  },
  {
    title: "턴 진행",
    body: "차례마다 1장을 뽑고, 손패 2장 중 1장을 공개로 내려놓아 효과를 해결합니다.",
  },
  {
    title: "라운드 종료",
    body: "한 명만 남거나 덱이 바닥나면 종료되고, 손패 숫자와 공개 카드 합으로 승자를 정합니다.",
  },
  {
    title: "대기실 시작",
    body: "호스트는 준비하지 않고, 정원이 찬 뒤 비호스트 참가자가 모두 준비되면 게임을 시작합니다.",
  },
];

export function getLoveLetterCard(id: LlCardId): LlCardDefinition {
  return LOVE_LETTER_CARD_DEFS[id];
}

export function getLoveLetterTokenGoal(playerLimit: number | null | undefined): number {
  if (playerLimit === 2) return 7;
  if (playerLimit === 3) return 5;
  return 4;
}

export function getLoveLetterStatusLabel(status: LlRoomStatus): string {
  if (status === "waiting") return "대기 중";
  if (status === "playing") return "진행 중";
  return "종료";
}

export function getLoveLetterStatusChipClass(status: LlRoomStatus): string {
  if (status === "waiting") {
    return "border border-rose-200/25 bg-rose-300/10 text-rose-50";
  }
  if (status === "playing") {
    return "border border-amber-200/25 bg-amber-300/10 text-amber-50";
  }
  return "border border-white/15 bg-white/10 text-white";
}

export function getLoveLetterPhaseLabel(phase: LlRoundPhase): string {
  if (phase === "dealing") return "배분 중";
  if (phase === "await_turn") return "턴 대기";
  if (phase === "await_broadcaster_resolution") return "방송부장 정리 중";
  if (phase === "round_reveal") return "결과 공개";
  if (phase === "await_next_round") return "다음 라운드 대기";
  return "매치 종료";
}

function withLoveLetterRawServerError(message: string, raw: string): string {
  return `${message}\n원문: ${raw}`;
}

export function formatLoveLetterError(raw: string, code?: string): string {
  const normalized = raw.trim().toUpperCase();
  const lower = raw.toLowerCase();
  if (
    raw.includes("ll_append_player_event") ||
    raw.includes("ll_get_player_events_jsonb") ||
    raw.includes("ll_player_events")
  ) {
    return withLoveLetterRawServerError(
      "플레이어별 서버 메세지용 SQL이 빠져 있습니다. ll-broadcaster-rpc-hotfix.sql 또는 최신 ll-schema.sql을 다시 적용해 주세요.",
      raw
    );
  }
  if ((code === "PGRST202" || lower.includes("does not exist")) && raw.includes("ll_append_action_log")) {
    return withLoveLetterRawServerError(
      "러브레터 액션 로그 함수 시그니처가 오래된 상태입니다. 최신 ll-schema.sql 또는 ll-broadcaster-rpc-hotfix.sql을 다시 적용해 주세요.",
      raw
    );
  }
  if ((code === "PGRST202" || lower.includes("does not exist")) && raw.includes("ll_get_room_view")) {
    return withLoveLetterRawServerError(
      "러브레터 방 조회 SQL이 오래된 상태입니다. 최신 ll-schema.sql 또는 ll-broadcaster-rpc-hotfix.sql을 다시 적용해 주세요.",
      raw
    );
  }
  if (
    (code === "PGRST202" || lower.includes("does not exist")) &&
    (raw.includes("ll_advance_turn_after_action") || raw.includes("ll_finish_round"))
  ) {
    return withLoveLetterRawServerError(
      "러브레터 턴 진행 SQL이 오래된 상태입니다. 최신 ll-schema.sql을 다시 적용해 주세요.",
      raw
    );
  }
  if ((code === "PGRST202" || lower.includes("does not exist")) && raw.includes("ll_resolve_broadcaster")) {
    return withLoveLetterRawServerError(
      "방송부장 정리 함수 시그니처가 오래된 상태입니다. 최신 ll-schema.sql을 다시 적용해 주세요.",
      raw
    );
  }
  if (code === "PGRST202" || lower.includes("could not find the function public.ll_")) {
    return withLoveLetterRawServerError(
      "러브레터용 Supabase 함수가 없습니다. 최신 ll-schema.sql을 먼저 적용해 주세요.",
      raw
    );
  }
  if (lower.includes("does not exist")) {
    return withLoveLetterRawServerError("러브레터 SQL 내부 참조가 어긋났습니다.", raw);
  }
  if (normalized.includes("STATEMENT TIMEOUT") || normalized.includes("CANCELING STATEMENT DUE TO STATEMENT TIMEOUT")) {
    return withLoveLetterRawServerError(
      "러브레터 방 조회가 타임아웃되었습니다. Supabase에 최신 ll-schema.sql 또는 ll-room-membership-hotfix.sql을 적용해 주세요.",
      raw
    );
  }
  if (normalized.includes("INVALID_PLAYER_LIMIT")) return "인원수는 2인, 3인, 4인 중 하나만 선택할 수 있습니다.";
  if (normalized.includes("ROOM_NOT_FOUND")) return "방을 찾을 수 없습니다.";
  if (normalized.includes("ROOM_FULL")) return "정원이 가득 찬 방입니다.";
  if (normalized.includes("ROOM_NOT_WAITING")) return "이미 시작된 방입니다.";
  if (normalized.includes("ROOM_NOT_PLAYING")) return "현재 진행 중인 게임이 아닙니다.";
  if (normalized.includes("ROOM_NOT_FINISHED")) return "아직 종료된 게임이 아닙니다.";
  if (normalized.includes("PLAYER_ALREADY_JOINED")) return "이미 입장한 방입니다.";
  if (normalized.includes("PLAYER_NOT_IN_ROOM")) return "방 참가자가 아닙니다.";
  if (normalized.includes("PLAYER_LIMIT_NOT_MET")) return "선택한 정원만큼 참가자가 모여야 시작할 수 있습니다.";
  if (normalized.includes("PLAYERS_NOT_READY")) return "호스트를 제외한 모든 참가자가 준비를 완료해야 시작할 수 있습니다.";
  if (normalized.includes("HOST_READY_NOT_REQUIRED")) return "호스트는 준비할 필요가 없습니다.";
  if (normalized.includes("ONLY_HOST_CAN_START")) return "호스트만 게임을 시작할 수 있습니다.";
  if (normalized.includes("ONLY_HOST_CAN_ADVANCE")) return "호스트만 다음 라운드를 시작할 수 있습니다.";
  if (normalized.includes("NOT_YOUR_TURN")) return "현재 당신의 턴이 아닙니다.";
  if (normalized.includes("CARD_NOT_IN_HAND")) return "해당 카드는 현재 손패에 없습니다.";
  if (normalized.includes("TARGET_REQUIRED")) return "대상을 먼저 선택해 주세요.";
  if (normalized.includes("GUESS_REQUIRED")) return "추측할 카드를 선택해 주세요.";
  if (normalized.includes("INVALID_TARGET")) return "지금은 해당 플레이어를 지목할 수 없습니다.";
  if (normalized.includes("INVALID_GUESS")) return "선도부원으로는 선도부원 자체를 추측할 수 없습니다.";
  if (normalized.includes("BROADCASTER_PENDING")) return "방송부장 효과를 먼저 정리해야 합니다.";
  if (normalized.includes("ONLY_PENDING_PLAYER_CAN_RESOLVE_BROADCASTER")) return "방송부장 효과를 확인 중인 플레이어만 정리할 수 있습니다.";
  if (normalized.includes("NEXT_ROUND_NOT_READY")) return "현재는 다음 라운드를 시작할 수 없습니다.";
  if (normalized.includes("ROOM_ALREADY_STARTED")) return "이미 시작된 게임입니다.";
  return raw;
}

export function getLoveLetterGuessableCards(): LlCardId[] {
  return [0, 2, 3, 4, 5, 6, 7, 8, 9];
}

export function normalizeLlCardId(value: unknown): LlCardId | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value) || value < 0 || value > 9) return null;
  return value as LlCardId;
}

export function normalizeLlCardArray(value: unknown): LlCardId[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = normalizeLlCardId(entry);
    return parsed === null ? [] : [parsed];
  });
}

export function normalizeLlStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (typeof entry === "string" && entry ? [entry] : []));
}

function normalizeLlStringNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (typeof entry !== "number" || !Number.isFinite(entry)) return [];
      return [[key, entry]];
    })
  );
}

function normalizeLlHandMap(value: unknown): Record<string, LlCardId[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([playerId, cards]) => [playerId, normalizeLlCardArray(cards)])
  );
}

function normalizeLlLogs(value: unknown): LlActionLogRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : null;

    return [{
      id: typeof row.id === "number" ? row.id : index,
      room_id: typeof row.room_id === "string" ? row.room_id : "",
      round_number: typeof row.round_number === "number" ? row.round_number : 0,
      action_type: typeof row.action_type === "string" ? row.action_type : "log",
      actor_id: typeof row.actor_id === "string" ? row.actor_id : null,
      actor_nickname: typeof row.actor_nickname === "string" ? row.actor_nickname : null,
      target_player_id: typeof row.target_player_id === "string" ? row.target_player_id : null,
      target_nickname: typeof row.target_nickname === "string" ? row.target_nickname : null,
      card_id: normalizeLlCardId(row.card_id),
      guessed_card: normalizeLlCardId(row.guessed_card),
      public_message: typeof row.public_message === "string" ? row.public_message : "",
      payload,
      created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    }];
  });
}

function normalizeLlServerEvents(value: unknown): LlServerEventRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : null;

    if (
      typeof row.id !== "number" ||
      typeof row.room_id !== "string" ||
      typeof row.player_id !== "string" ||
      typeof row.event_type !== "string" ||
      typeof row.title !== "string" ||
      typeof row.message !== "string"
    ) {
      return [];
    }

    return [{
      id: row.id,
      room_id: row.room_id,
      round_number: typeof row.round_number === "number" ? row.round_number : 0,
      player_id: row.player_id,
      event_type: row.event_type,
      title: row.title,
      message: row.message,
      detail: typeof row.detail === "string" ? row.detail : null,
      payload,
      created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    }];
  });
}

export function normalizeLlRoomRow(value: unknown): LlRoomRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const playerLimit = row.player_limit === 2 || row.player_limit === 3 || row.player_limit === 4
    ? row.player_limit
    : null;
  const status = row.status === "waiting" || row.status === "playing" || row.status === "finished"
    ? row.status
    : null;
  if (typeof row.id !== "string" || typeof row.room_code !== "string" || typeof row.host_id !== "string" || !playerLimit || !status) {
    return null;
  }

  return {
    id: row.id,
    room_code: row.room_code,
    host_id: row.host_id,
    player_limit: playerLimit,
    status,
    current_round: typeof row.current_round === "number" ? row.current_round : 0,
    target_token_count: typeof row.target_token_count === "number" ? row.target_token_count : getLoveLetterTokenGoal(playerLimit),
    final_winner_ids: normalizeLlStringArray(row.final_winner_ids),
    last_departed_nickname: typeof row.last_departed_nickname === "string" ? row.last_departed_nickname : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

export function normalizeLlRoomPlayers(value: unknown): LlRoomPlayerRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (
      typeof row.room_id !== "string" ||
      typeof row.player_id !== "string" ||
      typeof row.seat_index !== "number" ||
      typeof row.join_order !== "number" ||
      typeof row.ready !== "boolean" ||
      typeof row.token_count !== "number" ||
      typeof row.nickname_snapshot !== "string"
    ) {
      return [];
    }

    return [{
      room_id: row.room_id,
      player_id: row.player_id,
      seat_index: row.seat_index,
      join_order: row.join_order,
      ready: row.ready,
      token_count: row.token_count,
      nickname_snapshot: row.nickname_snapshot,
      left_at: typeof row.left_at === "string" ? row.left_at : null,
      last_active_at: typeof row.last_active_at === "string" ? row.last_active_at : null,
      joined_at: typeof row.joined_at === "string" ? row.joined_at : null,
    }];
  });
}

export function normalizeLlPrivateResult(value: unknown): LlPrivateResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.type !== "counselor" &&
    row.type !== "athlete" &&
    row.type !== "broadcaster" &&
    row.type !== "notice"
  ) {
    return null;
  }

  return {
    type: row.type,
    title: typeof row.title === "string" ? row.title : undefined,
    message: typeof row.message === "string" ? row.message : undefined,
    card_id: normalizeLlCardId(row.card_id),
    actor_card_id: normalizeLlCardId(row.actor_card_id),
    target_card_id: normalizeLlCardId(row.target_card_id),
    loser_player_id: typeof row.loser_player_id === "string" ? row.loser_player_id : null,
    options: normalizeLlCardArray(row.options),
  };
}

export function normalizeLlRoomView(value: unknown): LlRoomView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_VIEW;
  const row = value as Record<string, unknown>;

  const roundPhase = row.round_phase === "dealing" ||
    row.round_phase === "await_turn" ||
    row.round_phase === "await_broadcaster_resolution" ||
    row.round_phase === "round_reveal" ||
    row.round_phase === "await_next_round" ||
    row.round_phase === "match_finished"
    ? row.round_phase
    : EMPTY_VIEW.round_phase;

  const pendingInputSource = row.pending_input && typeof row.pending_input === "object" && !Array.isArray(row.pending_input)
    ? (row.pending_input as Record<string, unknown>)
    : {};

  const pendingKind = pendingInputSource.kind === "resolve_broadcaster" ? "resolve_broadcaster" : "none";

  return {
    room_id: typeof row.room_id === "string" ? row.room_id : "",
    round_number: typeof row.round_number === "number" ? row.round_number : 0,
    round_phase: roundPhase,
    starter_player_id: typeof row.starter_player_id === "string" ? row.starter_player_id : null,
    current_turn_player_id: typeof row.current_turn_player_id === "string" ? row.current_turn_player_id : null,
    next_starter_player_id: typeof row.next_starter_player_id === "string" ? row.next_starter_player_id : null,
    deck_count: typeof row.deck_count === "number" ? row.deck_count : 0,
    burned_card_hidden: typeof row.burned_card_hidden === "boolean" ? row.burned_card_hidden : true,
    reveal_all_hands: Boolean(row.reveal_all_hands),
    spectator_mode: Boolean(row.spectator_mode),
    my_hand: normalizeLlCardArray(row.my_hand),
    hand_counts: normalizeLlStringNumberRecord(row.hand_counts),
    discard_piles: normalizeLlHandMap(row.discard_piles),
    protected_player_ids: normalizeLlStringArray(row.protected_player_ids),
    eliminated_player_ids: normalizeLlStringArray(row.eliminated_player_ids),
    spectator_player_ids: normalizeLlStringArray(row.spectator_player_ids),
    round_winner_ids: normalizeLlStringArray(row.round_winner_ids),
    match_winner_ids: normalizeLlStringArray(row.match_winner_ids),
    tiebreak_sums: normalizeLlStringNumberRecord(row.tiebreak_sums),
    visible_hands: normalizeLlHandMap(row.visible_hands),
    server_events: normalizeLlServerEvents(row.server_events),
    recent_private_message: typeof row.recent_private_message === "string" ? row.recent_private_message : null,
    end_reason: typeof row.end_reason === "string" ? row.end_reason : null,
    logs: normalizeLlLogs(row.logs),
    pending_input: {
      kind: pendingKind,
      pending_card_id: normalizeLlCardId(pendingInputSource.pending_card_id),
      valid_target_ids: normalizeLlStringArray(pendingInputSource.valid_target_ids),
      valid_guess_card_ids: normalizeLlCardArray(pendingInputSource.valid_guess_card_ids),
      broadcaster_options: normalizeLlCardArray(pendingInputSource.broadcaster_options),
    },
  };
}

export function resolveLlRpcEnvelope(value: unknown): {
  room: LlRoomRow | null;
  view: LlRoomView | null;
  privateResult: LlPrivateResult | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { room: null, view: null, privateResult: null };
  }

  const row = value as Record<string, unknown>;
  const maybeRoom = normalizeLlRoomRow(row.room ?? value);
  const maybeView = row.view ? normalizeLlRoomView(row.view) : null;
  const maybePrivate = row.private_result ? normalizeLlPrivateResult(row.private_result) : null;

  if (!maybeView && typeof row.round_phase === "string") {
    return {
      room: maybeRoom,
      view: normalizeLlRoomView(value),
      privateResult: maybePrivate,
    };
  }

  return {
    room: maybeRoom,
    view: maybeView,
    privateResult: maybePrivate,
  };
}

export function getLlPrivateResultFromServerEvent(event: LlServerEventRow | null | undefined): LlPrivateResult | null {
  if (!event?.payload) return null;
  return normalizeLlPrivateResult(event.payload);
}

export function getLlPublicDiscardSum(cards: LlCardId[]): number {
  return cards.reduce<number>((sum, cardId) => sum + cardId, 0);
}

export function getLlCurrentHandCount(view: LlRoomView, playerId: string): number {
  const explicitCount = view.hand_counts[playerId];
  if (typeof explicitCount === "number") return explicitCount;
  if (view.visible_hands[playerId]) return view.visible_hands[playerId].length;
  return 0;
}

export function getLlVisibleHand(view: LlRoomView, playerId: string, isSelf: boolean): LlCardId[] {
  if (isSelf) return view.my_hand;
  return view.visible_hands[playerId] ?? [];
}

export function getLlSeatPlacements(
  players: LlRoomPlayerRow[],
  myPlayerId: string | null
): LlSeatPlacement[] {
  if (!myPlayerId) {
    return players
      .slice()
      .sort((left, right) => left.seat_index - right.seat_index)
      .map((player, index) => ({
        playerId: player.player_id,
        relativeSeatIndex: index,
        isSelf: false,
        style: {
          left: `${20 + index * 22}%`,
          top: "16%",
          transform: "translate(-50%, -50%)",
        },
      }));
  }

  const sortedPlayers = players
    .filter((player) => !player.left_at)
    .slice()
    .sort((left, right) => left.seat_index - right.seat_index);
  const mySeatIndex = sortedPlayers.find((player) => player.player_id === myPlayerId)?.seat_index;
  if (typeof mySeatIndex !== "number") return [];

  return sortedPlayers.map((player) => {
    const relativeSeatIndex = (player.seat_index - mySeatIndex + sortedPlayers.length) % sortedPlayers.length;
    return {
      playerId: player.player_id,
      relativeSeatIndex,
      isSelf: player.player_id === myPlayerId,
      style: getLlSeatStyle(relativeSeatIndex, sortedPlayers.length),
    };
  });
}

function getLlSeatStyle(relativeSeatIndex: number, playerCount: number): LlSeatPlacement["style"] {
  const fallback = {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  };

  if (relativeSeatIndex === 0) {
    return {
      left: "50%",
      top: "calc(100% - 1.75rem)",
      transform: "translate(-50%, -100%)",
    };
  }

  if (playerCount === 2) {
    return {
      left: "50%",
      top: "1.75rem",
      transform: "translate(-50%, 0)",
    };
  }

  if (playerCount === 3) {
    if (relativeSeatIndex === 1) {
      return {
        left: "24%",
        top: "1.75rem",
        transform: "translate(-50%, 0)",
      };
    }
    if (relativeSeatIndex === 2) {
      return {
        left: "76%",
        top: "1.75rem",
        transform: "translate(-50%, 0)",
      };
    }
  }

  if (playerCount === 4) {
    if (relativeSeatIndex === 1) {
      return {
        left: "20%",
        top: "2.25rem",
        transform: "translate(-50%, 0)",
      };
    }
    if (relativeSeatIndex === 2) {
      return {
        left: "50%",
        top: "1.25rem",
        transform: "translate(-50%, 0)",
      };
    }
    if (relativeSeatIndex === 3) {
      return {
        left: "80%",
        top: "2.25rem",
        transform: "translate(-50%, 0)",
      };
    }
  }

  return fallback;
}

export function getLlDefaultValidTargetIds(
  cardId: LlCardId,
  myPlayerId: string | null,
  players: LlRoomPlayerRow[],
  protectedPlayerIds: string[],
  eliminatedPlayerIds: string[]
): string[] {
  if (!myPlayerId) return [];

  const protectedSet = new Set(protectedPlayerIds);
  const eliminatedSet = new Set(eliminatedPlayerIds);
  const activePlayers = players.filter((player) => !player.left_at);

  if (cardId === 4 || cardId === 6 || cardId === 8 || cardId === 9 || cardId === 0) {
    return [];
  }

  if (cardId === 5) {
    const others = activePlayers
      .filter((player) => player.player_id !== myPlayerId)
      .filter((player) => !eliminatedSet.has(player.player_id))
      .filter((player) => !protectedSet.has(player.player_id))
      .map((player) => player.player_id);
    return others.length > 0 ? [myPlayerId, ...others] : [myPlayerId];
  }

  return activePlayers
    .filter((player) => player.player_id !== myPlayerId)
    .filter((player) => !eliminatedSet.has(player.player_id))
    .filter((player) => !protectedSet.has(player.player_id))
    .map((player) => player.player_id);
}

export function getLlTurnNotice(view: LlRoomView, myPlayerId: string | null): string {
  if (!myPlayerId) return "로그인이 필요합니다.";
  if (view.round_phase === "await_broadcaster_resolution" && view.current_turn_player_id === myPlayerId) {
    return "방송부장 효과를 정리해 주세요.";
  }
  if (view.current_turn_player_id === myPlayerId) {
    return "내 차례입니다. 손패 2장 중 1장을 공개하세요.";
  }
  if (view.round_phase === "await_next_round") {
    return "라운드 결과를 확인하는 중입니다.";
  }
  if (view.round_phase === "match_finished") {
    return "최종 결과가 확정되었습니다.";
  }
  return "상대 플레이어의 행동을 기다리는 중입니다.";
}

export function getLlRoundEndReasonLabel(reason: string | null): string {
  if (!reason) return "라운드 결과를 정리하는 중입니다.";
  if (reason === "last_player_standing") return "마지막 생존자 판정";
  if (reason === "deck_exhausted") return "덱 소진 판정";
  if (reason === "player_left") return "참가자 이탈로 종료";
  if (reason === "inactive_forfeit") return "잠수 판정으로 종료";
  return reason;
}

export function formatLlTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
