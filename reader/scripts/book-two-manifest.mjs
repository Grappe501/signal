/** Book Two: The Great Disconnection — reader manifest (micro outlines + architecture notes) */

export const BOOK_TWO = {
  title: "The Great Disconnection",
  subtitle: "Book 2 · The Signal Cycle",
  thesis: "CONTROL",
};

export const BOOK_TWO_PARTS = [
  { id: "b2-start", label: "Book Two — Continuation" },
  { id: "b2-act-i", label: "Act I · False Peace", chapters: [1, 8] },
  { id: "b2-act-ii", label: "Act II · Correction", chapters: [9, 21] },
  { id: "b2-act-iii", label: "Act III · Separation", chapters: [22, 36] },
  { id: "b2-act-iv", label: "Act IV · Emergency", chapters: [37, 50] },
  { id: "b2-act-v", label: "Act V · Realignment", chapters: [51, 68] },
  { id: "b2-act-vi", label: "Act VI · Aftermath", chapters: [69, 82] },
  { id: "b2-architecture", label: "Book Two · Architecture notes" },
];

/** Populated at build time from micro outlines — see build-book-two.mjs */
export const BOOK_TWO_CHAPTERS = [];
