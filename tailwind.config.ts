import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        ivory: "#f8fafc",
      },
      boxShadow: {
        glow: "0 0 30px rgba(250, 204, 21, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
