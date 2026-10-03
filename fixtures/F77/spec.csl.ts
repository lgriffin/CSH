// Fixture F77. A second, unrelated domain, specified with no change to the kernel.
import { system, int, unit, and } from "csl";

const C = unit("tenths", "C");

export default system("ClimateControl", (s) => {
  const Mode = s.enum("Mode", ["Heating", "Idle"]);

  const Zone = s.state("Zone", {
    target: int(C),
    minimum: int(C),
    maximum: int(C),
    temperature: int(C),
  });

  const SetTarget = s.event("SetTarget", { on: Zone, args: { requested: int(C) }, returns: Mode });

  s.transition(SetTarget, ({ pre, post, args, result }) => ({
    when: args.requested.gte(pre.minimum).and(args.requested.lte(pre.maximum)),
    then: and(
      post.target.eq(args.requested),
      args.requested.gt(pre.temperature).implies(result.eq(Mode.Heating)),
      args.requested.lte(pre.temperature).implies(result.eq(Mode.Idle)),
      post.minimum.eq(pre.minimum),
      post.maximum.eq(pre.maximum),
      post.temperature.eq(pre.temperature),
    ),
    otherwise: and(
      result.eq(Mode.Idle),
      post.target.eq(pre.target),
      post.minimum.eq(pre.minimum),
      post.maximum.eq(pre.maximum),
      post.temperature.eq(pre.temperature),
    ),
  }));

  s.policy("ComfortSafety", { require: ["SolverCheck"], reject: [] });

  s.intent("KeepInBand", {
    owner: "FacilitiesOwner",
    value: "Keep every zone's target temperature inside its agreed band",
    assurance: "ComfortSafety",
  }, (i) => {
    i.assume("SaneBand", Zone.minimum.lte(Zone.maximum));

    i.invariant("TargetInBand", and(Zone.target.gte(Zone.minimum), Zone.target.lte(Zone.maximum)));

    i.requirement("IgnoreOutOfBand", {
      when: SetTarget,
      and: ({ pre, args }) => args.requested.gt(pre.maximum),
      shall: ({ pre, post }) => post.target.eq(pre.target),
      ensures: ({ result }) => [result.eq(Mode.Idle)],
    });

    i.example("RaiseWithinBand", {
      given: { target: C(200), minimum: C(160), maximum: C(240), temperature: C(180) },
      when: SetTarget({ requested: C(220) }),
      then: ({ post, result }) => and(post.target.eq(C(220)), result.eq(Mode.Heating)),
    });
  });

  s.bind(Zone.target, "targetTenths");
  s.bind(Zone.temperature, "temperatureTenths");
});
