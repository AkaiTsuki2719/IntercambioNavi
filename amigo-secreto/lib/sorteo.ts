/**
 * Sorteo completo con degradación por capas.
 * Duras: nadie se saca a sí mismo, nada de recíprocos, exclusiones declaradas.
 * Blandas: no repetir ediciones anteriores, con peso decreciente por antigüedad.
 * Si no hay solución, suelta lo MÍNIMO — nunca falla, nunca apaga la regla entera.
 */
export type Id = string;
export interface Concesion { dador: Id; receptor: Id; hace: number | null; }
export interface Resultado { asignacion: Map<Id, Id>; concesiones: Concesion[]; }

export function sortear(
  personas: Id[],
  exclusiones: Set<string>,      // "a|b" = a no le puede regalar a b
  historial: Map<Id, Id>[],      // de más reciente a más vieja
  memoria: number,
): Resultado {
  const n = personas.length;
  if (n < 3) throw new Error("hacen falta al menos 3 personas");

  const costo = new Map<string, number>();
  const tope = Math.min(memoria, historial.length);
  for (let k = 0; k < tope; k++) {
    const peso = tope - k;
    for (const [d, r] of historial[k]) {
      const c = `${d}|${r}`;
      costo.set(c, (costo.get(c) ?? 0) + peso);
    }
  }

  const duro = (d: Id, r: Id) => d !== r && !exclusiones.has(`${d}|${r}`);

  const mezclar = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const intentar = (techo: number): Map<Id, Id> | null => {
    const orden = mezclar([...personas]);
    const usado = new Set<Id>();
    const asig = new Map<Id, Id>();

    const paso = (i: number, acum: number): boolean => {
      if (acum > techo) return false;
      if (i === n) return true;
      const d = orden[i];
      const cands = personas
        .filter((r) => !usado.has(r) && duro(d, r) && asig.get(r) !== d)
        .map((r) => ({ r, c: costo.get(`${d}|${r}`) ?? 0 }));
      mezclar(cands).sort((a, b) => a.c - b.c);
      for (const { r, c } of cands) {
        if (acum + c > techo) break;
        usado.add(r); asig.set(d, r);
        if (paso(i + 1, acum + c)) return true;
        usado.delete(r); asig.delete(d);
      }
      return false;
    };
    return paso(0, 0) ? asig : null;
  };

  const max = [...costo.values()].reduce((a, b) => a + b, 0) + 1;
  for (let techo = 0; techo <= max; techo++) {
    const asig = intentar(techo);
    if (!asig) continue;
    const concesiones: Concesion[] = [];
    for (const [d, r] of asig) {
      if ((costo.get(`${d}|${r}`) ?? 0) > 0) {
        let hace: number | null = null;
        for (let k = 0; k < historial.length; k++)
          if (historial[k].get(d) === r) { hace = k + 1; break; }
        concesiones.push({ dador: d, receptor: r, hace });
      }
    }
    return { asignacion: asig, concesiones };
  }
  throw new Error("las restricciones duras son imposibles");
}
