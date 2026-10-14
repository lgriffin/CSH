package retry

import "time"

type Policy struct {
	Retries int
	Backoff time.Duration
}

func (p Policy) Attempts() int { return p.Retries + 1 }
