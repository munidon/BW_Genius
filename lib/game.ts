export type PlayerId = "A" | "B";
export type TileColor = "black" | "white";

export type RoundResult = "A_WIN" | "B_WIN" | "DRAW";

export interface RoundRecord {
  setNumber: number;
  roundInSet: number;
  leadPlayer: PlayerId;
  followPlayer: PlayerId;
  aTile: number;
  bTile: number;
  result: RoundResult;
}

export const ALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function tileColor(tile: number): TileColor {
  return tile % 2 === 0 ? "black" : "white";
}

export function getOpponent(player: PlayerId): PlayerId {
  return player === "A" ? "B" : "A";
}

export function decideRoundResult(aTile: number, bTile: number): RoundResult {
  if (aTile === bTile) return "DRAW";

  // Special rule: 1 beats 9.
  if (aTile === 1 && bTile === 9) return "A_WIN";
  if (aTile === 9 && bTile === 1) return "B_WIN";

  return aTile > bTile ? "A_WIN" : "B_WIN";
}

export function nextLeadPlayer(
  currentLead: PlayerId,
  result: RoundResult
): PlayerId {
  if (result === "DRAW") return currentLead;
  if (result === "A_WIN") return "A";
  return "B";
}

export function getPublicResultMessage(result: RoundResult): string {
  if (result === "DRAW") return "무승부";
  if (result === "A_WIN") return "플레이어 A 승리";
  return "플레이어 B 승리";
}
