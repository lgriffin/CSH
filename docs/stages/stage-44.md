# Stage 44: Process and safety

**Exit:** a private subject and a committed local-path subject are each warned about, and the manifest guide shows how
to keep a local profile out of git ([13](../spec/13-from-real-runs.md), section 7; [issue 66](https://github.com/lgriffin/CSH/issues/66), section 7).

**Status:** exit reached. Unit tests in `packages/run/test/safety.test.ts`.

## Built

- `run` (`safety`): `githubSlug`, `isPathRepo`, `localPathWarning` and `subjectWarnings`, with the commands they run
  passed in so that they are tested without git or `gh` ([A-159](../../ASSUMPTIONS.md)).
- `cli`: `csh subject fetch` prints both warnings to stderr; `csh run` prints the local-path one in its summary.
- `docs/guides/manifest.md`: profiles of private repositories, and `.git/info/exclude`.

## Not done

- No fixture: a repository's visibility is not something a fixture can hold, and the warnings change no report.
- Visibility is asked only of GitHub; another host's subject is never warned about.
