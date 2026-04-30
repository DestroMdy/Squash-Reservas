export type PatagonianCircuitKey = "cdr" | "tw" | "pmy" | "bch" | "nqn";

export type PatagonianRankingEntry = {
  playerName: string;
  city: string;
  scores: Partial<Record<PatagonianCircuitKey, number>>;
  total: number;
  position: number;
};

export type PatagonianRankingCategory = {
  id: string;
  title: string;
  subtitle: string;
  entries: PatagonianRankingEntry[];
};

export const patagonianCircuitLabels: Record<PatagonianCircuitKey, string> = {
  cdr: "CDR",
  tw: "TW",
  pmy: "PMY",
  bch: "BCH",
  nqn: "NQN"
};

export const patagonianRankingUpdatedLabel = "Marzo 2026";

export const patagonianRankingCategories: PatagonianRankingCategory[] = [
  {
    id: "primera",
    title: "1ra Categoria",
    subtitle: "Circuito Patagonico",
    entries: [
      { playerName: "Juan Segundo Barreyro", city: "Posadas", scores: { cdr: 200 }, total: 200, position: 1 },
      { playerName: "Portabales Santiago", city: "Mar del Plata", scores: { cdr: 150 }, total: 150, position: 2 },
      { playerName: "Gustavo Lomaglio", city: "Bariloche", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Oliver Denholm", city: "Puerto Madryn", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Ignacio Gutiérrez Keen", city: "CABA", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Diego Albistro", city: "Neuquén", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Pablo Waisberg", city: "Comodoro", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Cristian Grigioni", city: "La Plata", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Juan Ignacio Fernandez", city: "Bariloche", scores: { cdr: 50 }, total: 50, position: 5 },
      { playerName: "Daniel Soto", city: "Bariloche", scores: { cdr: 50 }, total: 50, position: 5 },
      { playerName: "Emanuel Augurusa", city: "Trelew", scores: { cdr: 37.5 }, total: 37.5, position: 6 },
      { playerName: "Jeremías Broccardo", city: "Bariloche", scores: { cdr: 37.5 }, total: 37.5, position: 6 },
      { playerName: "Juan Varrente", city: "Esquel", scores: { cdr: 12.5 }, total: 12.5, position: 7 },
      { playerName: "Alejo Pires", city: "Rada Tilly", scores: { cdr: 12.5 }, total: 12.5, position: 7 },
      { playerName: "Agustín Rivero", city: "Bariloche", scores: { cdr: 12.5 }, total: 12.5, position: 7 },
      { playerName: "Enzo Peña", city: "Asunción PY", scores: { cdr: 12.5 }, total: 12.5, position: 7 },
      { playerName: "Luca Antenuchi", city: "Resistencia", scores: { cdr: 12.5 }, total: 12.5, position: 7 }
    ]
  },
  {
    id: "damas-primera",
    title: "Damas 1ra Categoria",
    subtitle: "Circuito Patagonico",
    entries: []
  },
  {
    id: "segunda",
    title: "2da Categoria",
    subtitle: "Circuito Patagonico",
    entries: [
      { playerName: "Emanuel Augurusa", city: "Trelew", scores: { cdr: 200 }, total: 200, position: 1 },
      { playerName: "Ansel Denholm", city: "Puerto Madryn", scores: { cdr: 150 }, total: 150, position: 2 },
      { playerName: "Nicolás Grazzini", city: "Rosario", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Enzo Peña", city: "Asunción PY", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Alejo Pires", city: "Rada Tilly", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Santino Choperena", city: "Rada Tilly", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Pablo Llebana", city: "Bariloche", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Darío Denholm", city: "Puerto Madryn", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Leonardo Ivanoff", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 5 },
      { playerName: "Salvador Choperena", city: "Rada Tilly", scores: { cdr: 12.5 }, total: 12.5, position: 5 },
      { playerName: "Víctor Antenuchi", city: "Resistencia", scores: { cdr: 12.5 }, total: 12.5, position: 5 }
    ]
  },
  {
    id: "tercera",
    title: "3ra Categoria",
    subtitle: "Circuito Patagonico",
    entries: [
      { playerName: "Sebastián Martínez", city: "La Pampa", scores: { cdr: 200 }, total: 200, position: 1 },
      { playerName: "Maximiliano Sanzana", city: "Comodoro", scores: { cdr: 150 }, total: 150, position: 2 },
      { playerName: "Pablo Choperena", city: "Rada Tilly", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Nelson Martínez", city: "Puerto Madryn", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Néstor Zanotto", city: "Comodoro", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Javier Santana", city: "Trelew", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Iván Perrone", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 5 },
      { playerName: "Pedro Paiva", city: "Puerto Madryn", scores: { cdr: 12.5 }, total: 12.5, position: 5 },
      { playerName: "Genaro Paiva", city: "Puerto Madryn", scores: { cdr: 12.5 }, total: 12.5, position: 5 }
    ]
  },
  {
    id: "cuarta",
    title: "4ta Categoria",
    subtitle: "Circuito Patagonico",
    entries: [
      { playerName: "Alfredo Méndez", city: "Rada Tilly", scores: { cdr: 200 }, total: 200, position: 1 },
      { playerName: "Juan Ignacio Madroñal", city: "Comodoro", scores: { cdr: 150 }, total: 150, position: 2 },
      { playerName: "Agustín Bianchi", city: "Puerto Madryn", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Juan Ignacio Loddo", city: "Comodoro", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Juan Simón Hernández", city: "Rada Tilly", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Martín Magaldi", city: "Comodoro", scores: { cdr: 75 }, total: 75, position: 4 },
      { playerName: "Diego Rosales", city: "Neuquén", scores: { cdr: 12.5 }, total: 12.5, position: 5 },
      { playerName: "Leonardo Didier", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 5 },
      { playerName: "Santino Paiva", city: "Puerto Madryn", scores: { cdr: 12.5 }, total: 12.5, position: 5 }
    ]
  },
  {
    id: "quinta",
    title: "5ta Categoria",
    subtitle: "Circuito Patagonico",
    entries: [
      { playerName: "Iona García", city: "Puerto Madryn", scores: { cdr: 200 }, total: 200, position: 1 },
      { playerName: "Micaela Wulff", city: "Puerto Madryn", scores: { cdr: 150 }, total: 150, position: 2 },
      { playerName: "Pablo Cuttini", city: "Comodoro", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Andrea García", city: "Comodoro", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Joel Durán", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 4 },
      { playerName: "Pablo Grané Raheb", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 4 }
    ]
  },
  {
    id: "sexta-menores",
    title: "6ta Categoria - Menores",
    subtitle: "Circuito Patagonico",
    entries: [
      { playerName: "Rita Cárdenas", city: "Comodoro", scores: { cdr: 200 }, total: 200, position: 1 },
      { playerName: "Cecilia Aravena", city: "Neuquén", scores: { cdr: 150 }, total: 150, position: 2 },
      { playerName: "Araceli Bordoni", city: "Comodoro", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Martín Delgado", city: "Comodoro", scores: { cdr: 100 }, total: 100, position: 3 },
      { playerName: "Gabriela Moreno", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 4 },
      { playerName: "Juan Cruz Praddaude", city: "Comodoro", scores: { cdr: 12.5 }, total: 12.5, position: 4 }
    ]
  }
];

export const patagonianScoringSystem = [
  { stage: "Campeon", points: 200 },
  { stage: "Final", points: 150 },
  { stage: "Semifinal", points: 100 },
  { stage: "Cuartos de final", points: 75 },
  { stage: "Octavos de final", points: 50 },
  { stage: "Zona", points: 12.5 }
];

export const patagonianRankingSummary = {
  playerCount: patagonianRankingCategories.reduce(
    (total, category) => total + category.entries.length,
    0
  ),
  categoryCount: patagonianRankingCategories.length
};
