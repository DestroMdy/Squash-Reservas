import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ranking Patagonico | Squash",
  description: "Ranking actual del Circuito Patagonico de Squash por categoria."
};

export default function RankingPatagonicoLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
