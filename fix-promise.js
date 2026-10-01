
const fs = require("fs");
let code = fs.readFileSync("src/app/api/data/cierre_diario/route.ts", "utf8");

const regex = /const \[[^\]]+\] = await Promise\.all\(\[[\s\S]*?\]\);/;
const replacement = `const [resBarrios, resAgrupadas, resTecnicos, resHoras, resResumen, resMetas, resMes, resAsigTotal, resMesPorDia] = await Promise.all([
      query(sqlBarrios),
      query(sqlOrdenesAgrupadas, cteResult.params),
      query(sqlTecnicos, cteResult.params),
      query(sqlHoras, cteResult.params),
      query(sqlResumenDia, cteResult.params),
      query(sqlMetasBrigadas, cteResult.params),
      query(sqlMesBarrios),
      query(sqlAsignadasTotal),
      query(sqlMesPorDia),
    ]);`;

code = code.replace(regex, replacement);
fs.writeFileSync("src/app/api/data/cierre_diario/route.ts", code, "utf8");
console.log("Fixed Promise.all");

