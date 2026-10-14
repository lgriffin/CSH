package store

// MemoryStore keeps cards in memory.
type MemoryStore struct {
	cards []string
}

// AuditedStore is a memory store that logs each change.
type AuditedStore struct {
	*MemoryStore
	log []string
}

// CachedStore keeps a copy of its cards.
type CachedStore struct {
	cards []string
}
