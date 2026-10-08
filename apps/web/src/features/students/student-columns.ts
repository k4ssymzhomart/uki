// Column widths of A.2's students table, from Figma 104:10579: the row has 20 px of padding on each
// side and its cells follow each other without gaps (student 330, group 190, exams 90, flags 100, last
// exam 230, status 138). The first cell carries the left padding and the last the right one, so a
// header cell and the row cells of its column share one class and line up.
export const studentColumns = {
  student: "w-87.5 pl-5",
  group: "w-47.5",
  exams: "w-22.5",
  flags: "w-25",
  lastExam: "w-57.5",
  status: "w-39.5 pr-5",
} as const;
