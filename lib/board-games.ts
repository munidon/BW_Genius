export type BoardGameEntry = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  available: boolean;
  imageSrc?: string;
};

export const BOARD_GAMES: BoardGameEntry[] = [
  {
    slug: "black-white",
    title: "흑과 백",
    subtitle: "The Black and White",
    description: "1:1 실시간 심리전. 상대의 패를 예측하고 짜릿한 역전승을 이뤄보세요!",
    href: "/games/black-white",
    available: true,
    imageSrc: "/images/black_white/landing.jpg",
  },
  {
    slug: "twelve-janggi",
    title: "십이장기",
    subtitle: "Twelve Janggi",
    description: "1:1 실시간 수싸움. 포로를 활용하고 왕 침투를 완성해 승리를 가져오세요!",
    href: "/games/twelve-janggi",
    available: true,
    imageSrc: "/images/twelve_janggi/landing.png",
  },
  {
    slug: "love-letter",
    title: "러브 레터",
    subtitle: "Love Letter",
    description: "2~4인 실시간 카드 테이블. 지목, 비교, 교환, 보호를 엮어 비밀 폴라로이드 토큰을 먼저 모아보세요!",
    href: "/games/love-letter",
    available: true,
    imageSrc: "/images/love_letters/characters/president.png",
  },
  {
    slug: "coming-soon-02",
    title: "추가 예정",
    subtitle: "Coming Soon",
    description: "추가 예정",
    href: "#",
    available: false,
    imageSrc: "",
  },
];
