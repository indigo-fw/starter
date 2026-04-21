/**
 * Dependency-cruiser config for Indigo.
 *
 * Module colors are pattern-based — new modules get colored automatically
 * based on their directory prefix, no manual entries needed.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  options: {
    doNotFollow: { path: ["node_modules", "\\.next", "\\.indigo"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    includeOnly: "^src/",
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        theme: {
          graph: {
            bgcolor: "#0f0f14",
            color: "#e0e0e8",
            fontcolor: "#e0e0e8",
            fontname: "Helvetica",
            rankdir: "LR",
          },
          node: {
            color: "#4a4a6a",
            fontcolor: "#e0e0e8",
            fillcolor: "#1a1a22",
            fontname: "Helvetica",
            fontsize: 11,
          },
          edge: {
            color: "#4a4a6a",
            fontcolor: "#7878a0",
            fontname: "Helvetica",
            fontsize: 9,
          },
          modules: [
            // Core engine + server infra (blue)
            {
              criteria: { source: "^src/(server|core)/" },
              attributes: { fillcolor: "#1a2a3a", color: "#60a5fa" },
            },
            // Any core-* module (purple — catches all current + future modules)
            {
              criteria: { source: "^src/core-" },
              attributes: { fillcolor: "#2a1a3a", color: "#c084fc" },
            },
            // Project-layer config/lib (amber)
            {
              criteria: { source: "^src/(config|lib|generated)/" },
              attributes: { fillcolor: "#3a2a1a", color: "#fbbf24" },
            },
          ],
          dependencies: [
            {
              criteria: { resolved: "^src/core-" },
              attributes: { color: "#c084fc" },
            },
            {
              criteria: { resolved: "^src/(core|server)/" },
              attributes: { color: "#60a5fa" },
            },
          ],
        },
      },
    },
  },
};
