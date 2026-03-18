import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidIssueForm,
  missingIssueFormFields,
  parseIssueForm,
  slugifyIssueTitle
} from "../scripts/lib/issue-form.mjs";

const issueBody = fs.readFileSync(
  path.join(process.cwd(), "tests", "fixtures", "issue-body.md"),
  "utf8"
);

test("parseIssueForm extracts all required sections", () => {
  const parsed = parseIssueForm(issueBody);

  assert.equal(parsed.problemStatement, "Add a reproducible factory scaffold for issue-to-PR automation.");
  assert.match(parsed.goals, /Generate planning artifacts/);
  assert.equal(parsed.affectedArea, "CI / Automation");
  assert.equal(isValidIssueForm(parsed), true);
  assert.deepEqual(missingIssueFormFields(parsed), []);
});

test("missingIssueFormFields reports omitted sections", () => {
  const parsed = parseIssueForm("### Problem statement\n\nOnly one section");

  assert.equal(isValidIssueForm(parsed), false);
  assert.deepEqual(missingIssueFormFields(parsed), [
    "goals",
    "nonGoals",
    "constraints",
    "acceptanceCriteria",
    "risk",
    "affectedArea"
  ]);
});

test("parseIssueForm accepts GitHub issue form heading levels", () => {
  const parsed = parseIssueForm(`
## Problem statement

Problem text

## Goals

- Goal one

## Non-goals

- Not this

## Constraints

- Constraint

## Acceptance criteria

- Works

## Risk

- Risk

## Affected area

CI / Automation
`);

  assert.equal(isValidIssueForm(parsed), true);
  assert.equal(parsed.problemStatement, "Problem text");
  assert.equal(parsed.affectedArea, "CI / Automation");
});

test("slugifyIssueTitle normalizes issue titles", () => {
  assert.equal(
    slugifyIssueTitle("[Factory] Build first autonomous loop"),
    "build-first-autonomous-loop"
  );
});
