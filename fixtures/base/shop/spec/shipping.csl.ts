// A small component for the status, queue and agent fixtures (F97 to F99, F113 to F117): the starter's rule and its
// bindings, with no harness, so that a fixture evaluates it without running tests.
import { system, int, unit } from "csl";

const Euros = unit("money", "EUR");

export default system("Shop", (s) => {
  const Shop = s.state("Shop", {});
  const Quote = s.event("Quote", { on: Shop, args: { orderTotal: int(Euros) }, returns: int(Euros) });

  const Requirements = s.source("Requirements", { kind: "Requirements", at: "docs/requirements.md" });

  s.policy("Checked", { require: ["ApprovedBinding", "BoundaryWitness"] });

  s.intent("FairShipping", { owner: "ProductOwner", value: "Large orders ship free", assurance: "Checked" }, (i) => {
    i.requirement("FreeShippingFrom50", {
      when: Quote,
      and: ({ args }) => args.orderTotal.gte(Euros(50)),
      shall: ({ result }) => result.eq(Euros(0)),
      cites: [{ source: Requirements, id: "SHIP-001" }],
    });
    i.requirement("ChargeBelow50", {
      when: Quote,
      and: ({ args }) => args.orderTotal.lt(Euros(50)),
      shall: ({ result }) => result.gt(Euros(0)),
      cites: [{ source: Requirements, id: "SHIP-002" }],
    });
  });

  s.bind(Quote.args.orderTotal, "orderTotal");
  s.bind(Quote.result, "fee");
});
