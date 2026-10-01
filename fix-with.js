
const fs = require("fs");
let code = fs.readFileSync("src/app/api/data/cierre_diario/route.ts", "utf8");

code = code.replace(/WITH \r?\n\s+SELECT/g, "WITH ${cteResult.cte}\n        SELECT");
code = code.replace(/WITH ,\r?\n\s+tec_brig/g, "WITH ${cteResult.cte},\n        tec_brig");

fs.writeFileSync("src/app/api/data/cierre_diario/route.ts", code, "utf8");
console.log("Fixed");

