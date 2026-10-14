# Requirements

### GRN-1 Lock after repeated failures

The service shall lock the account when `attempts` reaches three within the `window`.

### GRN-2 Keep withdrawals above the floor

The service shall refuse a withdrawal that would take the `balance` below the `floor`.

### GRN-3 Refuse requests over the quota

The service shall refuse a request when the `quota` for the current `period` is spent.

### GRN-4 Retry with backoff

The client shall wait for the `backoff` before each of its `retries`.

### GRN-5 Evict expired entries

The cache shall evict an entry when its `ttl` has passed or the `capacity` is reached.

### GRN-6 Count failures

The service shall count each failed sign-in in `attempts`.
