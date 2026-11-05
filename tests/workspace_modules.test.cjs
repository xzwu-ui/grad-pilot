#!/usr/bin/env node
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Modules = require("../dashboard/modules.js");

function school(id = "berkeley") {
  return {
    id,
    name: "UC Berkeley",
    aliases: ["Berkeley"],
    department_track: "EECS",
    program_name: "Ph.D. in EECS",
    deadline: "2027-12-08T23:59:00-08:00",
    deadline_verified: false,
    portal_url: "https://example.edu/apply",
    status: "Researching",
    target_pis: [{ id: "test-pi", name: "Test PI", fit_score: 5, recent_work_keywords: ["humanoid control", "sim-to-real"], verification_status: "needs_2026_review", contact: { status: "not_started" } }],
    recommendations: { required: 3, assignments: [] },
    budget: {}
  };
}

test("school plans have stable ids, valid dependencies and no duplicate initialization", () => {
  const data = { tasks: [] };
  const candidate = school();
  assert.equal(Modules.ensureSchoolPlan(data, candidate), 7);
  assert.equal(candidate.application_checklist.length, 9);
  assert.equal(Modules.ensureSchoolPlan(data, candidate), 0);
  assert.equal(Modules.ensureSchoolPlan(data, candidate, { force: true }), 0);
  assert.equal(new Set(data.tasks.map((task) => task.id)).size, 7);
  const ids = new Set(data.tasks.map((task) => task.id));
  data.tasks.forEach((task) => task.depends_on.forEach((dependency) => assert.ok(ids.has(dependency))));
  assert.equal(data.tasks.find((task) => task.id.endsWith("task-submit")).due_date, "2027-12-01");
});

test("global season covers pre-research through enrollment without changing school deadlines", () => {
  const data = { cycle: { target_term: "2028 Fall" }, tasks: [] };
  const phases = Modules.seasonPlan(data, "2026-11-04");
  assert.equal(phases.length, 6);
  assert.deepEqual(phases.map(phase => phase.id), ["foundation", "discovery", "writing", "submission", "decisions", "transition"]);
  assert.equal(phases[0].start, "2026-11-01");
  assert.equal(phases[0].end, "2027-06-30");
  assert.equal(phases[0].status, "current");
  assert.equal(phases[1].status, "upcoming");
  assert.equal(phases.at(-1).end, "2028-08-31");
  assert.equal(Modules.ensureSeasonPlan(data), 6);
  assert.equal(Modules.ensureSeasonPlan(data), 0);
  assert.equal(data.tasks[0].school_id, null);
  assert.equal(data.tasks[0].season_phase, "foundation");
  assert.equal(data.tasks[1].depends_on[0], "season-foundation");
  data.tasks[0].title = "My edited milestone";
  Modules.ensureSeasonPlan(data);
  assert.equal(data.tasks[0].title, "My edited milestone");
  const calendar = Modules.calendar({ schools: [], tasks: data.tasks });
  assert.ok(calendar.includes("season-foundation@gradpilot.local"));
  assert.ok(calendar.includes("My edited milestone"));
});

test("PI keyword matching returns evidence rather than an admissions probability", () => {
  const pi = { recent_work_keywords: ["humanoid whole-body control", "sim-to-real transfer", "motion planning"] };
  const applicant = { research_keywords: ["humanoid control", "sim-to-real", "unrelated topic"] };
  assert.deepEqual(Modules.researchKeywordMatches(pi, applicant), ["humanoid control", "sim-to-real"]);
  assert.deepEqual(Modules.researchKeywordMatches(pi, { research_keywords: [] }), []);
});
test("readiness score is bounded, explainable and improves with verified evidence", () => {
  const candidate = school();
  const data = { applicant: { research_keywords: ["sim-to-real"], gpa: 3.4, gpa_scale: 4 }, assets: [], documents: [], schools: [candidate] };
  const before = Modules.scoreSchool(candidate, data);
  assert.equal(before.components.reduce((sum, component) => sum + component.max, 0), 100);
  assert.ok(before.total >= 0 && before.total <= 100);
  assert.ok(before.risks.length > 0);
  candidate.target_pis[0].verification_status = "verified_official";
  candidate.target_pis[0].admissions_status = "accepting";
  candidate.target_pis[0].paper_title = "A Real Paper";
  candidate.target_pis[0].paper_notes = "A specific method connection.";
  candidate.target_pis[0].fit_note = "A specific fit.";
  candidate.deadline_verified = true;
  const after = Modules.scoreSchool(candidate, data);
  assert.ok(after.total > before.total);
  assert.ok(after.components.every((component) => component.earned >= 0 && component.earned <= component.max && component.detail));
  assert.deepEqual(after.dimensions.map(dimension => dimension.id), ["research_fit", "readiness", "data_confidence"]);
  assert.equal(after.dimensions.reduce((sum, dimension) => sum + dimension.max, 0), 100);
  assert.ok(after.dimensions.every(dimension => dimension.score >= 0 && dimension.score <= 100));
  assert.ok(after.dimensions.find(dimension => dimension.id === "data_confidence").score > before.dimensions.find(dimension => dimension.id === "data_confidence").score);
});

test("essay checks catch word limits, placeholders, wrong term and another school", () => {
  const berkeley = school("berkeley");
  const stanford = { ...school("stanford"), name: "Stanford University", aliases: ["Stanford"] };
  const data = { cycle: { target_term: "2028 Fall" }, schools: [berkeley, stanford] };
  const essay = { type: "SoP", word_limit: 4, content: "Berkeley Stanford Your Name 2027 Fall" };
  const result = Modules.lintEssay(essay, berkeley, data);
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert.ok(codes.has("WORD_LIMIT"));
  assert.ok(codes.has("PLACEHOLDER"));
  assert.ok(codes.has("TERM"));
  assert.ok(codes.has("OTHER_SCHOOL"));
  assert.deepEqual(Modules.wordStats("Robot learning 机器人"), { english: 2, cjk: 3, total: 5 });
});

test("line diff and ICS preserve changes and omit completed tasks", () => {
  const rows = Modules.diffLines("same\nold", "same\nnew");
  assert.ok(rows.some((row) => row.type === "remove" && row.text === "old"));
  assert.ok(rows.some((row) => row.type === "add" && row.text === "new"));
  const candidate = school();
  candidate.status = "Waitlisted";
  candidate.funding = { deadline: "2027-11-15", verified: false, notes: "Separate fellowship", source_url: "https://example.edu/funding" };
  candidate.decision = { response_deadline: "2028-02-15", notes: "Waitlist response" };
  const data = { schools: [candidate], tasks: [
    { id: "open-task", title: "Open, verify", school_id: candidate.id, due_date: "2027-10-01", status: "todo", notes: "Line one\nLine two" },
    { id: "done-task", title: "Done", school_id: candidate.id, due_date: "2027-10-02", status: "done", notes: "" }
  ] };
  const calendar = Modules.calendar(data);
  assert.ok(calendar.includes("BEGIN:VCALENDAR\r\n"));
  assert.ok(calendar.includes("Open\\, verify"));
  assert.ok(calendar.includes("Line one\\nLine two"));
  assert.ok(!calendar.includes("done-task@gradpilot.local"));
  assert.ok(calendar.includes("berkeley--funding-deadline@gradpilot.local"));
  assert.ok(calendar.includes("berkeley--response-deadline@gradpilot.local"));
  assert.ok(calendar.includes("Separate fellowship"));
});
