const fs = require("node:fs");
const ts = require("../apps/desktop/node_modules/typescript");

require.extensions[".ts"] = function registerTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const target = process.argv[2];
process.argv = [process.argv[0], target, ...process.argv.slice(3)];
require(target);
