/* Prueba del motor con las ediciones reales del grupo.
   node lo corre sin transpilar:  npm run sorteo:test  */
import { sortear } from "./sorteo.ts";

const e2025 = new Map(Object.entries({ Argenis:"Ivannia", Brittany:"Siviany", Damaris:"Thiago",
  Hazel:"Jonathan", Ivannia:"Hazel", Jonathan:"Oscar", Meylin:"Damaris", Oscar:"Argenis",
  Siviany:"Meylin", Thiago:"Brittany" }));
const e2023 = new Map(Object.entries({ Argenis:"Raquel", Brittany:"Ivannia", Damaris:"Siviany",
  Hazel:"Oscar", Ivannia:"Hazel", Jonathan:"Argenis", Meylin:"Thiago", Oscar:"Brittany",
  Siviany:"Meylin", Thiago:"Reychel" }));

const personas = [...e2025.keys()];
const r = sortear(personas, new Set<string>(), [e2025, e2023], 2);

for (const [d, x] of r.asignacion) console.log(`${d.padEnd(10)} -> ${x}`);
console.log("concesiones:", r.concesiones.length || "ninguna");

// ninguna asignacion puede repetir 2025 ni 2023
for (const [d, x] of r.asignacion) {
  if (e2025.get(d) === x || e2023.get(d) === x) throw new Error("repitio: " + d + "->" + x);
  if (r.asignacion.get(x) === d) throw new Error("reciproco: " + d + "<->" + x);
  if (d === x) throw new Error("se saco a si mismo: " + d);
}
console.log("verificado: sin repeticiones, sin reciprocos, sin autoasignacion");
