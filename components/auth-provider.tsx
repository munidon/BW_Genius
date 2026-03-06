"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  userId: string | null;
  nickname: string;
  requiresNickname: boolean;
  isLoading: boolean;
  profileLoading: boolean;
  isBusy: boolean;
  error: string;
  clearError: () => void;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  saveNickname: (nickname: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const formatAuthError = (raw: string) => {
  const lower = raw.toLowerCase();
  if (lower.includes("provider is not enabled")) {
    return "Google 로그인이 비활성화되어 있습니다. Supabase Auth Provider 설정을 확인해 주세요.";
  }
  if (lower.includes("oauth")) {
    return "Google 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return raw;
};

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

const clearSupabasePersistedSession = () => {
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
};

const stripAuthCallbackParams = () => {
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
};

export function AuthProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, setSession] = useState<Session | null>(null);
  const [nickname, setNickname] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const profileSyncSeqRef = useRef(0);

  const syncProfileNickname = useCallback(async (uid: string | null) => {
    const profileSyncSeq = ++profileSyncSeqRef.current;

    if (!supabase || !uid) {
      setNickname("");
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const { data, error: profileError } = await supabase
      .from("bw_profiles")
      .select("nickname")
      .eq("id", uid)
      .maybeSingle();

    if (profileSyncSeq !== profileSyncSeqRef.current) return;

    if (profileError) {
      setError("닉네임 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setNickname("");
      setProfileLoading(false);
      return;
    }

    setNickname((data?.nickname ?? "").trim());
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase 환경변수가 없습니다. .env.local을 설정해 주세요.");
      setIsLoading(false);
      setProfileLoading(false);
      return;
    }

    const handleSessionChange = (nextSession: Session | null) => {
      setSession(nextSession);
      setError("");
      if (!nextSession) {
        clearSupabasePersistedSession();
        setNickname("");
        setProfileLoading(false);
      } else {
        void syncProfileNickname(nextSession.user.id);
      }
      stripAuthCallbackParams();
      setIsBusy(false);
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError(formatAuthError(sessionError.message));
      }
      handleSessionChange(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      handleSessionChange(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncProfileNickname]);

  const clearError = useCallback(() => {
    setError("");
  }, []);

  const signInWithGoogle = useCallback(async (redirectPath = "/") => {
    if (!supabase) {
      setError("Supabase 환경변수가 없습니다. .env.local을 설정해 주세요.");
      return;
    }

    setError("");
    setIsBusy(true);

    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}${redirectPath}`
      : undefined;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (oauthError) {
      setError(formatAuthError(oauthError.message));
      setIsBusy(false);
      return;
    }
  }, []);

  const saveNickname = useCallback(async (rawNickname: string) => {
    if (!supabase) {
      setError("Supabase 환경변수가 없습니다. .env.local을 설정해 주세요.");
      return false;
    }

    const uid = session?.user?.id;
    if (!uid) {
      setError("로그인 후 다시 시도해 주세요.");
      return false;
    }

    const trimmedNickname = rawNickname.trim();
    if (!trimmedNickname) {
      setError("닉네임을 입력해 주세요.");
      return false;
    }

    setError("");
    setIsBusy(true);

    const { error: upsertError } = await supabase.from("bw_profiles").upsert({
      id: uid,
      nickname: trimmedNickname,
    });

    if (upsertError) {
      setError(formatNicknameError(upsertError.message, upsertError.code));
      setIsBusy(false);
      return false;
    }

    setNickname(trimmedNickname);
    setProfileLoading(false);
    setIsBusy(false);
    return true;
  }, [session]);

  const logout = useCallback(async () => {
    if (!supabase) {
      setError("Supabase 환경변수가 없습니다. .env.local을 설정해 주세요.");
      return;
    }

    setError("");
    setIsBusy(true);

    const { error: globalSignOutError } = await supabase.auth.signOut({ scope: "global" });
    if (globalSignOutError) {
      const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });
      if (localSignOutError) {
        setError(`로그아웃 실패: ${globalSignOutError.message}`);
        setIsBusy(false);
        return;
      }
    }

    clearSupabasePersistedSession();
    stripAuthCallbackParams();
    setSession(null);
    setIsBusy(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    nickname,
    requiresNickname: Boolean(session?.user?.id) && !profileLoading && !nickname.trim(),
    isLoading,
    profileLoading,
    isBusy,
    error,
    clearError,
    signInWithGoogle,
    saveNickname,
    logout,
  }), [
    session,
    nickname,
    profileLoading,
    isLoading,
    isBusy,
    error,
    clearError,
    signInWithGoogle,
    saveNickname,
    logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
