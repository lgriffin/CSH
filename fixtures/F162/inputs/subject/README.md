# Ledger

A small bookkeeping service.

## Design

- The domain module never imports the database module.
- The domain is guaranteed not to depend on the web layer.
- The database module does not import the web layer, and this is enforced in CI.

## Layout

Entries are posted in `src/ledger/domain.py` and stored by `src/ledger/db.py`. Monthly reports are built in
`src/ledger/report.py`.
