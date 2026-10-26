## Karpathy-style debugging protocol

When fixing a bug, follow this order strictly:

1. **Reproduce the issue first**
   - Do not change code until you can trigger the bug yourself.
   - Use the real user flow, not a guessed shortcut.

2. **State the behavior clearly**
   - Current behavior: what actually happens.
   - Expected behavior: what should happen.
   - If those are not explicit, stop and define them before coding.

3. **Trace the execution path**
   - Follow the click, route, state, storage, API, and render path.
   - Identify the exact file, function, and condition responsible.
   - Do not rely on symptoms alone.

4. **Find the root cause**
   - Explain why the bug happens.
   - Name the precise line or condition that causes it.
   - If the root cause is not known, do not patch blindly.

5. **Make the smallest possible fix**
   - Change only what is needed.
   - Avoid unrelated refactors.
   - Preserve working behavior everywhere else.

6. **Add or update a regression test**
   - Cover the bug with a test when practical.
   - The test must reflect the actual user behavior, not just implementation details.

7. **Verify in the browser or runtime**
   - The source of truth is the app behavior.
   - Do not claim success based on tests alone.
   - If the browser still shows the bug, continue debugging.

## Hard rules

- Do not guess.
- Do not claim a fix is complete until the user-visible behavior is correct.
- Do not apply multiple fixes at once unless they are directly required by the same root cause.
- Do not hide behind “implemented” or “tests passed” if the app still fails in the browser.
- If the issue comes back after navigation, refresh, auth loading, or remounting, trace state persistence first.
- If demo data appears unexpectedly, trace feature flags, initial state, and fallback paths first.