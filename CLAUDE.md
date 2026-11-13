# Search delegation

Use a subagent for searches so their results don't stay in this conversation and get re-sent on every turn.

## When to delegate
- Any search across more than 3 files, or any question that needs reading many files ("where is X used", "which files call Y", "list every command that does Z").
- Do not delegate a search that needs one known file: read it directly.

## How to delegate
- Use the Agent tool with subagent_type "Explore" and model "haiku".
- Write the prompt in full. The subagent has no context from this conversation, so the prompt must contain:
  1. **Task:** the exact question, in one sentence.
  2. **Scope:** the folders and files to search, and the folders to skip (e.g. node_modules, dist).
  3. **Permissions:** read-only. Do not edit, create, delete, run install commands, or run code that changes state.
  4. **Must not omit:** the things the answer must include (file path, line number, the exact function or line text, and any caller that is not in the scope).
  5. **Stop rule:** stop after at most 25 files or when the question is answered, whichever comes first. If the search is broader than that, return what you have and say what remains.
  6. **Output format:** a list of `path:line - one-line finding`, plus a short "not checked" section.

## After the search
- Treat the summary as a pointer, not as the source. Read the exact lines yourself before editing or quoting code.
- If the summary is missing something you need, run a narrower search, don't re-read everything.
