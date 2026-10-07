// Column widths of the table rows, from Figma (Row/Exam 50:2153, Row/Lobby 50:2214, Row/Session 50:2191).
// Every cell, header cells included, starts with 20 px of left padding, so a header cell and the
// row cells of its column share one class and line up. The last column (the action) takes the rest.

/** Row/Exam: exam 360, when 210, students 110, checks 200, status 180. */
export const rowExamColumns = {
  exam: "w-90",
  when: "w-52.5",
  students: "w-27.5",
  checks: "w-50",
  status: "w-45",
} as const;

/** Row/Lobby: student 320, step 300, device 170, status 190. */
export const rowLobbyColumns = {
  student: "w-80",
  step: "w-75",
  device: "w-42.5",
  status: "w-47.5",
} as const;

/** Row/Session: student 300, flags 300, duration 150, status 200. */
export const rowSessionColumns = {
  student: "w-75",
  flags: "w-75",
  duration: "w-37.5",
  status: "w-50",
} as const;
