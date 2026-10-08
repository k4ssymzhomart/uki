import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { requestPilot } from "./pilot-action.ts";
import { initialPilotState } from "./pilot-model.ts";

vi.mock("../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));

const rpc = vi.fn();
const INITIAL = initialPilotState(["2026-11"]);

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const FILLED = {
  name: "Dana Akhmetova",
  email: "dana.akhmetova@kru.test",
  university: "KRU · Kostanay",
  role: "exam_office",
  students: "from100",
  when: "2026-11",
  message: "Midterms, 4 groups.",
  demoDay: "on",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
});

describe("Book a pilot's server action", () => {
  it("calls request_pilot with the plan's five arguments and shows Sent", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    const state = await requestPilot(INITIAL, form(FILLED));
    expect(rpc).toHaveBeenCalledWith("request_pilot", {
      name: "Dana Akhmetova",
      email: "dana.akhmetova@kru.test",
      university: "KRU · Kostanay",
      role: "exam_office",
      message: "Midterms, 4 groups.\nstudents=from100\nwhen=2026-11\ndemo_day=yes",
    });
    expect(state).toMatchObject({ status: "sent", request: { email: "dana.akhmetova@kru.test" } });
  });

  it("shows the refusal and keeps what was typed when the address hit the daily limit", async () => {
    rpc.mockResolvedValue({ data: "rate_limited", error: null });
    const state = await requestPilot(INITIAL, form(FILLED));
    expect(state).toMatchObject({ status: "rateLimited", values: { name: "Dana Akhmetova", demoDay: true } });
  });

  it("says the request failed on a database error or an unknown reply", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function request_pilot does not exist" } });
    expect((await requestPilot(INITIAL, form(FILLED))).status).toBe("failed");
    rpc.mockResolvedValue({ data: { surprise: true }, error: null });
    expect((await requestPilot(INITIAL, form(FILLED))).status).toBe("failed");
    rpc.mockRejectedValue(new Error("fetch failed"));
    expect((await requestPilot(INITIAL, form(FILLED))).status).toBe("failed");
  });

  it("never calls the database for a form that does not pass its checks", async () => {
    const state = await requestPilot(INITIAL, form({ ...FILLED, email: "dana" }));
    expect(state).toMatchObject({ status: "editing", errors: { email: "emailInvalid" } });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
