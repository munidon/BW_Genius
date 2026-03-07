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
    slug: "coming-soon-02",
    title: "러브 레터",
    subtitle: "Coming Soooooooooooon",
    description: "현재 개발 중입니다.",
    href: "#",
    available: false,
    imageSrc: "",
  },
];
