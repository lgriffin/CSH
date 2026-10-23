export interface Rule {
  name: string;
}

export function buildRulesMap(rules: Rule[]): Map<string, Rule> {
  return new Map(rules.map((r) => [r.name, r]));
}
