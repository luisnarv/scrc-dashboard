export function getFestivosColombia(year: number): string[] {
  const festivos: string[] = [];
  
  // Fijos que NO se mueven
  const fijos = [
    '01-01', // Año nuevo
    '05-01', // Día del Trabajo
    '07-20', // Grito de Independencia
    '08-07', // Batalla de Boyacá
    '12-08', // Inmaculada Concepción
    '12-25', // Navidad
  ];
  
  if (year >= 2026) {
    fijos.push('07-13'); // Nuevo festivo a partir de 2026
  }

  fijos.forEach(f => festivos.push(`${year}-${f}`));

  // Helper para mover al próximo lunes (Ley Emiliani)
  const moverALunes = (date: Date): Date => {
    const day = date.getDay();
    if (day !== 1) { // Si no es lunes
      const diff = (day === 0 ? 1 : 8 - day);
      date.setDate(date.getDate() + diff);
    }
    return date;
  };

  const formatear = (d: Date) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Fijos que SE MUEVEN al próximo lunes (Ley Emiliani)
  const movibles = [
    new Date(year, 0, 6),   // Reyes Magos
    new Date(year, 2, 19),  // San José
    new Date(year, 5, 29),  // San Pedro y San Pablo
    new Date(year, 7, 15),  // Asunción
    new Date(year, 9, 12),  // Día de la Raza
    new Date(year, 10, 1),  // Todos los Santos
    new Date(year, 10, 11), // Independencia de Cartagena
  ];

  movibles.forEach(d => festivos.push(formatear(moverALunes(d))));

  // Calcular Pascua (Algoritmo de Computus / Gauss)
  const a = year % 19;
  const b = year % 4;
  const c = year % 7;
  const dPascua = (19 * a + 24) % 30;
  const diasPascua = dPascua + (2 * b + 4 * c + 6 * dPascua + 5) % 7;
  const mesPascua = diasPascua > 9 ? 3 : 2; // 2=Marzo, 3=Abril
  const diaPascua = diasPascua > 9 ? diasPascua - 9 : 22 + diasPascua;
  const pascua = new Date(year, mesPascua, diaPascua);

  // Festivos basados en la Pascua
  const juevesSanto = new Date(pascua); juevesSanto.setDate(pascua.getDate() - 3);
  const viernesSanto = new Date(pascua); viernesSanto.setDate(pascua.getDate() - 2);
  
  // Estos se mueven al siguiente lunes según Ley Emiliani
  const ascension = new Date(pascua); ascension.setDate(pascua.getDate() + 39);
  const corpus = new Date(pascua); corpus.setDate(pascua.getDate() + 60);
  const sagradoCorazon = new Date(pascua); sagradoCorazon.setDate(pascua.getDate() + 68);

  festivos.push(formatear(juevesSanto));
  festivos.push(formatear(viernesSanto));
  festivos.push(formatear(moverALunes(ascension)));
  festivos.push(formatear(moverALunes(corpus)));
  festivos.push(formatear(moverALunes(sagradoCorazon)));

  return festivos;
}

// Caché para no recalcular
const festivosCache: Record<number, Set<string>> = {};

export function esFestivo(date: Date): boolean {
  const y = date.getFullYear();
  if (!festivosCache[y]) {
    festivosCache[y] = new Set(getFestivosColombia(y));
  }
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const str = `${y}-${mm}-${dd}`;
  return festivosCache[y].has(str);
}
