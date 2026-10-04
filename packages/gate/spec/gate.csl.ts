// The gate component (Anchor, harnesses and A3, section 8): the disposition decision in src/gate.ts, described by the
// table of the Authority tab, section 6. Every rule here is a candidate written for the gate's owner. The decision is
// stateless, so the state has no fields; one event, Decide, takes what the gate reads about one approved obligation.
// Waiver expiry involves dates and stays outside the model, entering as the yes-or-no fact waiverValid.
import { system, bool, and, or } from "csl";

export default system("Gate", (s) => {
  const Verdict = s.enum("Verdict", ["satisfied", "violated", "conflicting", "unknown"]);
  const Applicability = s.enum("Applicability", ["current", "stale", "inapplicable", "unavailable"]);
  const Mode = s.enum("Mode", ["advisory", "enforcing"]);
  const Disposition = s.enum("Disposition", ["allow", "review", "block", "waived"]);

  const Gate = s.state("Gate", {});

  const Decide = s.event("Decide", {
    on: Gate,
    args: {
      verdict: Verdict,
      applicability: Applicability,
      mode: Mode,
      waiverValid: bool(),
      critical: bool(),
      selfApproved: bool(),
      needsReview: bool(),
    },
    returns: Disposition,
  });

  const Authority = s.source("Authority", { kind: "Requirements", at: "docs/requirements.md" });
  s.source("UnitTests", { kind: "Witnesses", at: "reports/witnesses.ndjson" });

  // The model: the table read row by row, each row an implication, in the order src/gate.ts applies them (countermeasure
  // C1 of the A3 in csh/a3/dispositions): conflicting, then violated, then unknown or stale, then self-approved needing
  // review, then allow. Each row's condition excludes the rows above it, so exactly one row holds for any input.
  s.transition(Decide, ({ args, result }) => {
    const enforcing = args.mode.eq(Mode.enforcing);
    const advisory = args.mode.eq(Mode.advisory);
    const unknownOrStale = or(args.verdict.eq(Verdict.unknown), and(args.verdict.eq(Verdict.satisfied), args.applicability.eq(Applicability.stale)));
    const current = and(args.verdict.eq(Verdict.satisfied), args.applicability.eq(Applicability.stale).not());
    const selfReview = and(args.selfApproved, args.needsReview);
    return {
      when: or(enforcing, advisory),
      then: and(
        args.verdict.eq(Verdict.conflicting).implies(and(enforcing.implies(result.eq(Disposition.block)), advisory.implies(result.eq(Disposition.review)))),
        and(args.verdict.eq(Verdict.violated), args.waiverValid.not()).implies(and(enforcing.implies(result.eq(Disposition.block)), advisory.implies(result.eq(Disposition.review)))),
        and(args.verdict.eq(Verdict.violated), args.waiverValid).implies(result.eq(Disposition.waived)),
        and(unknownOrStale, args.critical).implies(and(enforcing.implies(result.eq(Disposition.block)), advisory.implies(result.eq(Disposition.review)))),
        and(unknownOrStale, args.critical.not()).implies(result.eq(Disposition.review)),
        and(current, selfReview.not()).implies(result.eq(Disposition.allow)),
        and(current, selfReview).implies(result.eq(Disposition.review)),
      ),
    };
  });

  s.policy("GateSafety", {
    require: ["ApprovedBinding", "BoundaryWitness", "SolverCheck"],
    reject: ["MockOnly"],
  });

  // Each row of the table written as a predicate, citing the sentence it claims to express. A row's condition excludes
  // every row above it in the order of docs/requirements.md (C1).
  s.intent("NoViolationAllowed", {
    owner: "GateOwner",
    value: "A defect in the gate never turns a violation into an allow",
    assurance: "GateSafety",
  }, (i) => {
    i.requirement("BlockConflicting", {
      when: Decide,
      and: ({ args }) => args.verdict.eq(Verdict.conflicting),
      shall: ({ args, result }) => and(args.mode.eq(Mode.enforcing).implies(result.eq(Disposition.block)), args.mode.eq(Mode.advisory).implies(result.eq(Disposition.review))),
      cites: [{ source: Authority, id: "GATE-001" }],
    });

    i.requirement("BlockViolatedWithoutWaiver", {
      when: Decide,
      and: ({ args }) => and(args.verdict.eq(Verdict.violated), args.waiverValid.not()),
      shall: ({ args, result }) => and(args.mode.eq(Mode.enforcing).implies(result.eq(Disposition.block)), args.mode.eq(Mode.advisory).implies(result.eq(Disposition.review))),
      cites: [{ source: Authority, id: "GATE-002" }],
    });

    i.requirement("WaiveViolatedWithWaiver", {
      when: Decide,
      and: ({ args }) => and(args.verdict.eq(Verdict.violated), args.waiverValid),
      shall: ({ result }) => result.eq(Disposition.waived),
      cites: [{ source: Authority, id: "GATE-003" }],
    });

    i.requirement("BlockUnknownCritical", {
      when: Decide,
      and: ({ args }) => and(or(args.verdict.eq(Verdict.unknown), and(args.verdict.eq(Verdict.satisfied), args.applicability.eq(Applicability.stale))), args.critical),
      shall: ({ args, result }) => and(args.mode.eq(Mode.enforcing).implies(result.eq(Disposition.block)), args.mode.eq(Mode.advisory).implies(result.eq(Disposition.review))),
      cites: [{ source: Authority, id: "GATE-004" }],
    });

    i.requirement("ReviewUnknown", {
      when: Decide,
      and: ({ args }) => and(or(args.verdict.eq(Verdict.unknown), and(args.verdict.eq(Verdict.satisfied), args.applicability.eq(Applicability.stale))), args.critical.not()),
      shall: ({ result }) => result.eq(Disposition.review),
      cites: [{ source: Authority, id: "GATE-005" }],
    });

    i.requirement("AllowSatisfied", {
      when: Decide,
      and: ({ args }) => and(args.verdict.eq(Verdict.satisfied), args.applicability.eq(Applicability.stale).not(), and(args.selfApproved, args.needsReview).not()),
      shall: ({ result }) => result.eq(Disposition.allow),
      cites: [{ source: Authority, id: "GATE-006" }],
    });

    i.requirement("ReviewSelfApproved", {
      when: Decide,
      and: ({ args }) => and(args.verdict.eq(Verdict.satisfied), args.applicability.eq(Applicability.stale).not(), args.selfApproved, args.needsReview),
      shall: ({ result }) => result.eq(Disposition.review),
      cites: [{ source: Authority, id: "GATE-007" }],
    });
  });

  // How the probe's witness keys map to model terms. Candidate until approved.
  s.bind(Decide.args.verdict, "verdict");
  s.bind(Decide.args.applicability, "applicability");
  s.bind(Decide.args.mode, "mode");
  s.bind(Decide.args.waiverValid, "waiverValid");
  s.bind(Decide.args.critical, "critical");
  s.bind(Decide.args.selfApproved, "selfApproved");
  s.bind(Decide.args.needsReview, "needsReview");
  s.bind(Decide.result, "result");
});
