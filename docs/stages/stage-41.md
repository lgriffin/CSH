# Stage 41: Windows and line endings

**Exit:** an A3 approved on Windows verifies on Linux and back, the suite passes on `windows-latest` in CI, and a read
the sandbox refuses is named ([13](../spec/13-from-real-runs.md), section 4; [issue 66](https://github.com/lgriffin/CSH/issues/66)).

**Status:** see the pull request for the Windows job. Unit tests in `packages/kernel/test/kernel.test.ts`
(`textDigestOf`) and `packages/emit/test/sandbox.test.ts`.

## Built

- `kernel`: `textDigestOf` reads CRLF as LF before hashing. The judgments digest (`csh a3`, `csh approve #a3/...`,
  `csh status`, `csh queue`) and an A3 stage's report and gate digests use it ([A-149](../../ASSUMPTIONS.md)).
- `.gitattributes` keeps every text file of the repository LF in every checkout.
- CI: a `windows-latest` job runs the typecheck and the suite ([A-150](../../ASSUMPTIONS.md)).
- `emit`: an E-ACCESS from the sandbox names the path it refused and the usual cause; `run`: every `worktree add`
  sets `core.longpaths`, as clone and checkout already did ([A-151](../../ASSUMPTIONS.md)).

## Not done

- No fixture: nothing here changes a report on Linux, and the golden fixtures pass unchanged. The Windows job is the
  check that they pass there too.
- Digests of sources and manifests stay digests of the bytes: they key caches and the run record, where a different
  line ending is a different input.
