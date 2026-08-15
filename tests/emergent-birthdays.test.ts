// Emergent — birthdays helper: privacy-safe, window-bounded, first-name only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingBirthdays } from "../server/mobile-app/birthdays.ts";

const NOW = new Date(2026, 5, 1); // Mon 1 Jun 2026 (local)

test("returns only birthdays within the 7-day window, sorted by soonest", () => {
  const out = upcomingBirthdays(
    [
      { firstName: "Aarav", dateOfBirth: "2015-06-03" }, // in 2 days
      { firstName: "Bina", dateOfBirth: "2016-06-01" }, // today
      { firstName: "Chetan", dateOfBirth: "2014-06-20" }, // out of window
      { firstName: "Diya", dateOfBirth: "2013-06-08" }, // in 7 days (edge, included)
    ],
    NOW,
  );
  assert.deepEqual(out.map((e) => e.name), ["Bina", "Aarav", "Diya"]);
  assert.equal(out[0].isToday, true);
  assert.equal(out[1].inDays, 2);
});

test("never exposes surname, birth year or full DOB — first name only", () => {
  const out = upcomingBirthdays(
    [{ fullName: "Ishaan Kapoor Verma", dateOfBirth: "2012-06-02" }],
    NOW,
  );
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ["inDays", "isToday", "name", "weekday"]);
  assert.equal(out[0].name, "Ishaan"); // no surname
  assert.ok(!/2012|Kapoor|Verma/.test(JSON.stringify(out[0])));
});

test("ignores missing / malformed DOB and invalid Feb 29", () => {
  const out = upcomingBirthdays(
    [
      { firstName: "NoDob" },
      { firstName: "Bad", dateOfBirth: "not-a-date" },
      { firstName: "Leap", dateOfBirth: "2016-02-29" }, // not near NOW anyway
    ],
    NOW,
  );
  assert.deepEqual(out, []);
});

test("empty input yields empty list (safe zero-state)", () => {
  assert.deepEqual(upcomingBirthdays([], NOW), []);
});
