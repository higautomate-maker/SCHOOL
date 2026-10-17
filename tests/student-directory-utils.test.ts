import assert from "node:assert/strict";
import test from "node:test";
import { filterStudentRecords, studentsCsv } from "../app/school/student-directory-utils.ts";

const students = [
  { admissionNumber: "A-1", rollNumber: "1", fullName: "Asha Rao", className: "Grade 8", sectionName: "A", guardianName: "Ravi Rao", guardianPhone: "9999999999", status: "active" },
  { admissionNumber: "B-2", rollNumber: "2", fullName: "Ben Ali", className: "Grade 8", sectionName: "B", guardianName: "Sara Ali", guardianPhone: "8888888888", status: "inactive" },
  { admissionNumber: "C-3", rollNumber: "3", fullName: "Cara Shah", className: "Grade 9", sectionName: "A", guardianName: "Maya Shah", guardianPhone: "7777777777", status: "active" },
];

test("student filters combine class, section, status and search", () => {
  assert.deepEqual(filterStudentRecords(students, { className: "Grade 8", sectionName: "A", status: "active", query: "ravi" }).map((student) => student.fullName), ["Asha Rao"]);
  assert.deepEqual(filterStudentRecords(students, { className: "", sectionName: "", status: "inactive", query: "" }).map((student) => student.fullName), ["Ben Ali"]);
});

test("CSV exports only selected students and neutralizes spreadsheet formulas", () => {
  const csv = studentsCsv([{ ...students[0], guardianName: '=HYPERLINK("https://example.test")' }]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.ok(csv.includes("Asha Rao"));
  assert.ok(!csv.includes("Ben Ali"));
});
