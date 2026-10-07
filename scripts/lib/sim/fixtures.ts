// A roster shaped like the seeded Mathematics 2 group 204 (supabase/seed.sql), for the simulator tests.
import type { RosterEntry } from "./cast.ts";

const NAMED: Record<number, [string, string]> = {
  2: ["20235002", "Aigerim Baimukhanova"],
  5: ["20230912", "Arman Bekzhanov"],
  9: ["20235009", "Dana Zhaksylykova"],
  12: ["20231044", "Dias Kenzhebekov"],
  14: ["20231219", "Aruzhan Kassymova"],
  17: ["20235017", "Erlan Kairatov"],
  23: ["20231187", "Madina Tulegenova"],
  26: ["20235026", "Askar Mukanov"],
  30: ["20235030", "Timur Nurgaliyev"],
  33: ["20231302", "Zhansaya Omarova"],
  35: ["20235035", "Nurlan Abenov"],
  38: ["20235038", "Kamila Rakhimova"],
  41: ["20230877", "Yerlan Tokhtarov"],
  47: ["20235047", "Daniyar Serikbayev"],
  55: ["20235055", "Saule Temirbekova"],
  61: ["20235061", "Bauyrzhan Tursynov"],
};

export function seedRoster(): RosterEntry[] {
  return Array.from({ length: 128 }, (_, i) => {
    const seat = i + 1;
    const [number, name] = NAMED[seat] ?? [String(20235000 + seat), `Student${seat} Generic${seat}`];
    return {
      studentId: `b0000000-0000-4000-8000-0000${number}`,
      seat,
      number,
      name,
      locale: seat % 5 === 0 ? "ru" : "kk",
    } satisfies RosterEntry;
  });
}
