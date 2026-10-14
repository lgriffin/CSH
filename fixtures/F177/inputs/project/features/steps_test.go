package features

import "github.com/cucumber/godog"

func aBoardWith(n int) error    { return nil }
func aCardMovesTo(c string) error { return nil }
func theBoardHolds(n int) error  { return nil }

func InitializeScenario(ctx *godog.ScenarioContext) {
	ctx.Step(`^a board with (\d+) cards$`, aBoardWith)
	ctx.Step(`^a card moves to (\w+)$`, aCardMovesTo)
	ctx.Then(`^the board holds (\d+) cards$`, theBoardHolds)
}
