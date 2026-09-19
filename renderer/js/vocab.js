/* ═══════════════════════════════════════════════════════════════════════════
   APEX — vocabulario
   Las listas cerradas que comparten los diálogos y las vistas. Van en un
   módulo sin dependencias para que cualquiera pueda importarlas sin arrastrar
   el estado ni los overlays.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Unidades en las que se mide una dosis. La primera es la que propone el
    diálogo si los ajustes no dicen otra cosa. */
export const UNIDADES = ['mg', 'µg', 'g', 'ml', 'gotas', 'comprimidos', 'cápsulas', 'puffs', 'UI'];

/** Vías de administración. El id se guarda; el label se muestra. */
export const VIAS = [
  { id: 'oral',       label: 'Oral' },
  { id: 'sublingual', label: 'Sublingual' },
  { id: 'nasal',      label: 'Nasal' },
  { id: 'inhalada',   label: 'Inhalada' },
  { id: 'im',         label: 'Intramuscular' },
  { id: 'iv',         label: 'Intravenosa' },
  { id: 'sc',         label: 'Subcutánea' },
  { id: 'topica',     label: 'Tópica' },
  { id: 'rectal',     label: 'Rectal' },
  { id: 'otra',       label: 'Otra' },
];

/** Presentaciones de un ingreso: en qué viene cada unidad. */
export const PRESENTACIONES = [
  'Comprimidos', 'Comprimidos LP', 'Cápsulas', 'Grageas', 'Sobres', 'Ampollas', 'Parches', 'Frascos', 'Otra',
];

export const viaLabel = (id) => VIAS.find((v) => v.id === id)?.label || (id ? String(id) : '');

/**
 * El paso del campo de cantidad, según el orden de magnitud de la dosis
 * habitual: 200 mg se ajusta de a 25, 10 mg de a 1, 0,5 mg de a 0,1.
 */
export function pasoPara(habitual) {
  const v = Number(habitual);
  if (!Number.isFinite(v) || v <= 0) return 1;
  if (v >= 100) return 25;
  if (v >= 20) return 5;
  if (v >= 5) return 1;
  if (v >= 1) return 0.5;
  return 0.1;
}
