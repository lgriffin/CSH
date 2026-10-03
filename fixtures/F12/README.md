# F12

`post.floor.eq(pre.floor)` is removed from `then`. On the accepting branch the floor may then rise above the new
balance, so Q-PRES fails for MinimumBalance, and the gap view lists `floor` as unconstrained on that branch.
Semantic contract, section 7.2.
