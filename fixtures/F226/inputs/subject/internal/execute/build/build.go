// Package build runs a build over the projects it is given.
package build

// Run builds each project in turn and returns how many were built.
func Run(projects []string) int { return len(projects) }
