import { describe, expect, it } from "vitest";
import {
  allowedDomains,
  eventHost,
  hostnameOf,
  isAllowedHostname,
  isAllowedUrl,
  matchPatterns,
  stripPort,
} from "./hosts.ts";

describe("allowed hosts", () => {
  const allowed = ["exam.kru.test", "localhost:5180", "Wikipedia.org"];

  it("drops ports and case, as declarativeNetRequest domains have neither", () => {
    expect(stripPort("localhost:5180")).toBe("localhost");
    expect(stripPort("Exam.KRU.test.")).toBe("exam.kru.test");
    expect(stripPort("[::1]:8080")).toBe("[::1]");
    expect(allowedDomains([...allowed, "localhost:3000"])).toEqual([
      "exam.kru.test",
      "localhost",
      "wikipedia.org",
    ]);
  });

  it("matches the host and its subdomains on any port, nothing else", () => {
    expect(isAllowedHostname("exam.kru.test", allowed)).toBe(true);
    expect(isAllowedHostname("cdn.exam.kru.test", allowed)).toBe(true);
    expect(isAllowedHostname("localhost", allowed)).toBe(true);
    expect(isAllowedHostname("en.wikipedia.org", allowed)).toBe(true);
    expect(isAllowedHostname("notexam.kru.test", allowed)).toBe(false);
    expect(isAllowedHostname("kru.test", allowed)).toBe(false);
    expect(isAllowedHostname("exam.kru.test.evil.example", allowed)).toBe(false);
    expect(isAllowedHostname(null, allowed)).toBe(false);
    expect(isAllowedHostname("exam.kru.test", [])).toBe(false);
  });

  it("reads http(s) URLs only", () => {
    expect(hostnameOf("http://localhost:5180/physics-1/quiz-3")).toBe("localhost");
    expect(hostnameOf("https://EXAM.kru.test/x?y#z")).toBe("exam.kru.test");
    expect(hostnameOf("chrome://newtab/")).toBeNull();
    expect(hostnameOf("chrome-extension://abc/blocked.html")).toBeNull();
    expect(hostnameOf("not a url")).toBeNull();
    expect(hostnameOf(undefined)).toBeNull();
    expect(isAllowedUrl("http://localhost:5180/physics-1/quiz-3/attempt", allowed)).toBe(true);
    expect(isAllowedUrl("https://chat.openai.com/", allowed)).toBe(false);
    expect(isAllowedUrl("chrome://newtab/", allowed)).toBe(false);
  });

  it("gives events a valid host or null", () => {
    expect(eventHost("wikipedia.org")).toBe("wikipedia.org");
    expect(eventHost("bad host/with path")).toBeNull();
    expect(eventHost(null)).toBeNull();
  });

  it("makes content script match patterns for every allowed host", () => {
    expect(matchPatterns(allowed)).toEqual([
      "*://exam.kru.test/*",
      "*://*.exam.kru.test/*",
      "*://localhost/*",
      "*://wikipedia.org/*",
      "*://*.wikipedia.org/*",
    ]);
    expect(matchPatterns(["127.0.0.1:5180"])).toEqual(["*://127.0.0.1/*"]);
    expect(matchPatterns([])).toEqual([]);
  });
});
