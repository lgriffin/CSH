package build

import "testing"

func TestRunCountsProjects(t *testing.T) {
	if Run([]string{"a", "b"}) != 2 {
		t.Fatal("two projects")
	}
}
