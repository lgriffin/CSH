// The starter's specification: the vocabulary, one rule citing one sentence, and the bindings the probe's keys need.
import { system, int, unit } from "csl";

const Euros = unit("money", "EUR");

export default system("Shop", (s) => {
  // The fee depends only on the order, so the state has no fields.
  const Shop = s.state("Shop", {});
  const Quote = s.event("Quote", { on: Shop, args: { orderTotal: int(Euros) }, returns: int(Euros) });

  const Requirements = s.source("Requirements", { kind: "Requirements", at: "docs/requirements.md" });
  s.source("UnitTests", { kind: "Witnesses", at: "reports/witnesses.ndjson" });

  s.policy("Checked", { require: ["BoundaryWitness"] });

  s.intent("FairShipping", { owner: "ProductOwner", value: "Large orders ship free", assurance: "Checked" }, (i) => {
    i.requirement("FreeShippingFrom50", {
      when: Quote,
      and: ({ args }) => args.orderTotal.gte(Euros(50)),
      shall: ({ result }) => result.eq(Euros(0)),
      cites: [{ source: Requirements, id: "SHIP-001" }],
    });
  });

  s.bind(Quote.args.orderTotal, "orderTotal");
  s.bind(Quote.result, "fee");
});
