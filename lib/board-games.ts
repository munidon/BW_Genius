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
    slug: "coming-soon-01",
    title: "십이장기",
    subtitle: "Coming Soon",
    description: "1:1 실시간 수싸움. 상대의 수를 읽고 멋진 전략을 펼쳐보세요!",
    href: "#",
    available: false,
    imageSrc: "",
  },
  {
    slug: "coming-soon-02",
    title: "러브 레터",
    subtitle: "Coming Soooooooooooon",
    description: "랜딩에서 선택할 수 있는 새 게임을 이어서 추가할 수 있다.",
    href: "#",
    available: false,
    imageSrc: "",
  },
];
