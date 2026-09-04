import assert from "node:assert/strict";
import test from "node:test";

import {
  admitProviderNeutralLocator,
  resolveCanonicalRepositoryPath,
} from "./admission.mjs";

test("admits only the closed provider-neutral destination", () => {
  assert.deepEqual(
    admitProviderNeutralLocator("https://git.allowed.test/admitted/acme/repo.git"),
    {
      admitted: true,
      canonicalLocator: "https://git.allowed.test/admitted/acme/repo.git",
    },
  );
});

for (const [label, locator, reason] of [
  ["caller credential", "https://user:secret@git.allowed.test/admitted/repo.git", "CALLER_CREDENTIAL_DENIED"],
  ["protocol", "ssh://git.allowed.test/admitted/repo.git", "PROTOCOL_DENIED"],
  ["host", "https://evil.test/admitted/repo.git", "DESTINATION_DENIED"],
  ["path", "https://git.allowed.test/not-admitted/repo.git", "DESTINATION_DENIED"],
  ["IP literal", "https://127.0.0.1/admitted/repo.git", "IP_LITERAL_DENIED"],
  ["fragment", "https://git.allowed.test/admitted/repo.git#main", "FRAGMENT_DENIED"],
]) {
  test(`refuses ${label}`, () => {
    assert.deepEqual(admitProviderNeutralLocator(locator), { admitted: false, reason });
  });
}

test("derives a canonical path only from a lower-case Project UUID", () => {
  assert.deepEqual(
    resolveCanonicalRepositoryPath("/custody", "018f47a2-7b20-4e52-8a30-786f52ea6e0f"),
    {
      admitted: true,
      path: "/custody/018f47a2-7b20-4e52-8a30-786f52ea6e0f.git",
    },
  );
});

for (const projectId of [
  "../other-project",
  "018F47A2-7B20-4E52-8A30-786F52EA6E0F",
  "/absolute/path",
  "project-a",
]) {
  test(`refuses non-canonical Project path input: ${projectId}`, () => {
    assert.deepEqual(resolveCanonicalRepositoryPath("/custody", projectId), {
      admitted: false,
      reason: "PROJECT_ID_PATH_DENIED",
    });
  });
}
