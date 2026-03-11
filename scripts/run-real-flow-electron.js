const fs = require("node:fs");
const path = require("node:path");
const ts = require("../apps/desktop/node_modules/typescript");
const { app } = require("electron");

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

const target = path.resolve(process.argv[2]);
const remainingArgs = process.argv.slice(3);

app.whenReady().then(() => {
  process.argv = [process.argv[0], target, ...remainingArgs];
  require(target);
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
