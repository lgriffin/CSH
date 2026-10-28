# Requirements

- **REQ-1** The client shall send each request once.
* REQ-2: The client must retry a request that times out, at most three times.
- REQ-3 describes the backoff, which is still being designed.

## REQ-4 · Backoff

The client shall wait twice as long before each retry.

- **Verified by:** nothing yet
- **Status:** proposed
