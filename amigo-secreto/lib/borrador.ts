"use client";

import { useEffect, useState } from "react";

export type Borrador = {
  miNombre: string;
  participo: boolean;
  titulo: string;
  grupoNombre: string;
  fecha: string;
  tope: string;
  gente: string[];
  vetos: [number, number][];
  email: string;
  resultado: { codigo: string; concesiones: any[] } | null;
};

const CLAVE = "as_borrador";

const INICIAL: Borrador = {
  miNombre: "", participo: true, titulo: "", grupoNombre: "",
  fecha: "", tope: "", gente: ["", "", ""], vetos: [],
  email: "", resultado: null,
};

/**
 * El borrador vive en sessionStorage, no en el estado de un componente.
 * Así cada paso es una página independiente y navegar entre pasos no
 * depende de que un solo componente sobreviva.
 */
export function useBorrador() {
  const [b, setB] = useState<Borrador>(INICIAL);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CLAVE);
      if (raw) setB({ ...INICIAL, ...JSON.parse(raw) });
    } catch {}
    setListo(true);
  }, []);

  const set = (parche: Partial<Borrador>) =>
    setB((prev) => {
      const n = { ...prev, ...parche };
      try { sessionStorage.setItem(CLAVE, JSON.stringify(n)); } catch {}
      return n;
    });

  const limpiar = () => {
    try { sessionStorage.removeItem(CLAVE); } catch {}
    setB(INICIAL);
  };

  return { b, set, listo, limpiar };
}

/** Los nombres finales: yo primero si participo, sin repetidos. */
export function participantes(b: Borrador) {
  const otros = b.gente.map((g) => g.trim()).filter(Boolean);
  const yo = b.miNombre.trim();
  return b.participo && yo ? [yo, ...otros.filter((n) => n !== yo)] : otros;
}