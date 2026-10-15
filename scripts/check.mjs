import fs from "node:fs";
import vm from "node:vm";
for (const file of ["panel/main.js", "service/main.js"]) {
  new vm.Script(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), { filename: file });
  console.log("Syntax OK:", file);
}
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (pkg.openchamber?.apiVersion !== 1 || !pkg.openchamber?.contributes?.service?.surface) throw new Error("Invalid OpenChamber manifest");
console.log("Manifest OK:", pkg.name, pkg.version);
