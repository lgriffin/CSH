package api

type Code string

const (
	NotFound Code = "not_found"
	Conflict Code = "conflict"
)

var Status = map[Code]int{
	NotFound: 404,
	Conflict: 409,
}
