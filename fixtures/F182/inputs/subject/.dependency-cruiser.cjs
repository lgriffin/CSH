/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "types-self-contained",
      comment: "The types package imports nothing outside itself.",
      severity: "error",
      from: { path: "^packages/types/" },
      to: { path: "^packages/(?!types/)" }
    }
  ]
};
