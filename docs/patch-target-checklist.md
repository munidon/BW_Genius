# 흑과 백 패치 대상 체크리스트

Last updated: 2026-02-17 (America/Los_Angeles)

## 목적
- 보안/품질 이슈를 우선순위 순으로 한 번에 확인하고, 항목별로 독립 패치할 수 있도록 작업 단위를 고정한다.
- 각 항목은 완료 후 체크박스를 `[x]`로 변경한다.

## P0 (즉시)

- [ ] RPC 익명 실행 차단 + 함수 초반 인증 가드 추가
  - 문제 요약: anon 토큰으로도 RPC 본문이 실행되어 `401/403` 대신 비즈니스 예외(`ROOM_NOT_FOUND`)가 반환된다.
  - 대상 문서/함수:
    - `/Users/hhj/love_letters/docs/supabase-schema.sql:413` (`bw_submit_tile`)
    - `/Users/hhj/love_letters/docs/supabase-schema.sql:605` (`bw_leave_room`)
    - `/Users/hhj/love_letters/docs/supabase-schema.sql:679` (`bw_get_room_reveals`)
    - `/Users/hhj/love_letters/docs/supabase-schema.sql:717` (`bw_get_room_member_record`)
  - 패치 항목:
    - 각 RPC에 대해 `revoke execute on function ... from anon, public;` 명시.
    - `grant execute on function ... to authenticated;`만 허용.
    - 각 함수 시작부에 `auth.uid() is null` 검사 후 `AUTH_REQUIRED` 예외 반환.
    - 멤버십 검사식(`auth.uid() not in (...)`)은 null 안전한 비교식으로 교체.
  - 완료 기준:
    - anon RPC 호출 시 `AUTH_REQUIRED` 반환.
    - 인증 사용자 비멤버 호출 시 `NOT_ROOM_MEMBER` 반환.
    - 기존 멤버 호출 플로우/게임 로직 회귀 없음.

## P1 (당장 수정)

- [ ] 린트 파이프라인 복구 (Next.js 16 호환)
  - 문제 요약: `/Users/hhj/love_letters/package.json:9`의 `next lint`가 더 이상 유효하지 않아 `npm run lint` 실패.
  - 패치 항목:
    - lint 스크립트를 ESLint CLI 기반으로 교체.
    - 프로젝트 루트 `eslint.config.*` 추가.
    - 필요한 dev dependency(`eslint`, `eslint-config-next` 등) 추가.
    - CI에서 `npm run lint` 강제(워크플로 파일 추가/갱신).
  - 완료 기준:
    - 로컬 `npm run lint` 성공.
    - CI에서 lint 단계 성공.

- [ ] Supabase Auth 세션 지속/리프레시 활성화
  - 문제 요약: `/Users/hhj/love_letters/lib/supabase.ts:10`, `/Users/hhj/love_letters/lib/supabase.ts:11`에서 세션 지속/자동 갱신이 꺼져 있다.
  - 패치 항목:
    - `persistSession`, `autoRefreshToken` 정책을 재설정(일반 사용자 로그인 유지 기준으로 활성화).
    - 필요 시 세션 만료/복구 UX 문구 정리.
  - 완료 기준:
    - OAuth 로그인 후 새로고침해도 세션 유지.
    - 장시간 탭 유지 시 토큰 자동 갱신 동작.

- [ ] Supabase SQL 문서와 실제 스키마 드리프트 해소
  - 문제 요약: 코드에서는 `wins/losses`를 사용하지만 스키마 문서엔 누락.
  - 대상:
    - 코드 참조: `/Users/hhj/love_letters/components/black-white-online.tsx:468`
    - 코드 참조: `/Users/hhj/love_letters/components/black-white-online.tsx:489`
    - 문서 누락 위치: `/Users/hhj/love_letters/docs/supabase-schema.sql:6`
  - 패치 항목:
    - `bw_profiles`에 `wins`, `losses` 컬럼 정의를 문서에 반영.
    - 기존 DB 반영용 `alter table ... add column if not exists ...` 구문 추가.
    - 전적 갱신 책임(RPC/트리거/앱 계산) 위치를 문서 주석으로 명시.
  - 완료 기준:
    - 신규 DB에 문서 SQL만 실행해도 앱 쿼리 컬럼과 1:1 일치.
    - 문서 기준 재배포 시 컬럼 누락 오류 없음.

- [ ] 종료된 과거 방으로 자동 재입장되는 문제 수정 (stale finished room)
  - 문제 요약: 재로그인 시 최신 활성 방이 아니라 과거 `finished` 방으로 복귀되는 케이스가 발생한다.
  - 재현 시나리오:
    - A-B 경기 종료 -> 양쪽 이탈
    - A-C, B-D 경기 진행 후 종료
    - B 재로그인 시 A-B의 옛 `finished` 방에 자동 진입
  - 대상:
    - 방 자동 복구 쿼리: `/Users/hhj/love_letters/components/black-white-online.tsx:575`
    - 나가기 처리 RPC: `/Users/hhj/love_letters/docs/supabase-schema.sql:587`
  - 패치 항목:
    - `loadLatestRoom`에서 방 복구 우선순위를 `진행/대기 중 방 > 종료 방`으로 명시.
    - 종료 방(`status='finished'`)은 기본 자동 복구 대상에서 제외하거나, 최근성 판단을 `updated_at` 기준으로 재정의.
    - 두 플레이어 모두 방을 나간 시점의 방은 DB에서 삭제되도록 `bw_leave_room` 정리 로직을 보강.
    - 탭 종료/세션 끊김으로 leave RPC가 누락되는 경로를 고려해, 필요 시 정리 배치(주기 cleanup) 정책을 추가.
  - 완료 기준:
    - 사용자가 재로그인해도 과거 종료 방으로 강제 복귀되지 않음.
    - 양 플레이어 이탈 완료된 종료 방은 DB에 잔존하지 않음.
    - 재연결 시 최신 게임 컨텍스트(활성 방 또는 로비)로 일관되게 진입.

## P2 (빠른 정리)

- [ ] 규칙 문서와 구현의 동점 처리 정책 일치
  - 문제 요약: 규칙 문서는 연장전 요구, 구현/README는 9라운드 종료.
  - 대상:
    - 규칙 문서: `/Users/hhj/love_letters/docs/black-white-rules.md:25`
    - SQL 구현: `/Users/hhj/love_letters/docs/supabase-schema.sql:508`
    - README: `/Users/hhj/love_letters/README.md:5`
  - 패치 항목:
    - 정책 결정: `연장전 도입` 또는 `9라운드 종료 유지`.
    - 결정된 정책에 맞춰 문서/SQL/UI 문구를 동일하게 정렬.
  - 완료 기준:
    - 규칙 문서, README, SQL 구현의 종료 조건이 완전히 동일.

- [ ] Realtime 사용 시 과도한 2초 폴링 제거
  - 문제 요약: Realtime 구독 중에도 2초 주기 폴링을 병행해 호출량이 증가한다.
  - 대상:
    - Realtime 구독: `/Users/hhj/love_letters/components/black-white-online.tsx:656`
    - 폴링 루프: `/Users/hhj/love_letters/components/black-white-online.tsx:715`
  - 패치 항목:
    - 정상 연결 시 폴링 중단.
    - 연결 불안정/백그라운드 복귀 시에만 저주기(예: 15~30초) 보조 폴링.
  - 완료 기준:
    - 정상 Realtime 연결 상태에서 2초 폴링 미동작.
    - 연결 복구 시 상태 동기화 누락 없음.

## P3 (정리 권장)

- [ ] 로그인 디버그 로그 제거
  - 대상: `/Users/hhj/love_letters/components/black-white-online.tsx:772`
  - 패치 항목: OAuth 디버그 `console.info` 제거 또는 개발 모드 조건부 로깅으로 제한.
  - 완료 기준: 프로덕션 환경에서 인증 관련 디버그 로그 미출력.

## 권장 실행 순서

- [ ] 1단계: P0 RPC 권한/인증 경계
- [ ] 2단계: P1 lint 복구
- [ ] 3단계: P1 세션 정책 + 스키마 문서 동기화 + stale finished room 정리
- [ ] 4단계: P2 규칙 정합성 + 폴링 최적화
- [ ] 5단계: P3 로그 정리
