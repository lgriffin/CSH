# F184

A file the repository ignores is not missing ([18](../../docs/spec/18-from-the-toads-run.md), section 1; stage 62).

The subject's `.gitignore` lists `config/local.yaml` and every `.env` but `.env.example`. Each has a tracked template.

- `docs/setup.md` tells the operator to copy `config/local.example.yaml` to `config/local.yaml` and
  `services/api/.env.example` to `services/api/.env`. Both targets are ignored, so neither being missing is a gap.
- `docs/missing.md` names `config/limits.yaml`, which is neither tracked nor ignored. That is the only dangling
  reference.

The expected result was written from the specification before the code.
