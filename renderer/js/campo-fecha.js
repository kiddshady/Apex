/* ═══════════════════════════════════════════════════════════════════════════
   APEX — campos de fecha y hora

   Existen para no usar `<input type="date">` ni `type="time"`. Esos controles
   abren el calendario y el selector NATIVOS de Chromium: tipografía del
   sistema, colores del sistema, y un ícono que no se puede teñir ni sacar. Al
   lado del resto de la app se ven como lo que son, una página web adentro de
   una ventana.

   Además, para registrar una toma el calendario es peor: casi siempre es
   «ahora», y cuando no, se tipea 1400 y listo.

   El valor que se lee siempre es un timestamp (ms) o ISO (`aaaa-mm-dd` y
   `HH:MM`), que es como se guarda todo. Lo que se ve es dd/mm/aaaa y HH:MM,
   que es como se escribe acá.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from './ui.js';
import { Icons } from './icons.js';

const p2 = (n) => String(n).padStart(2, '0');

/* ── Fecha ───────────────────────────────────────────────────────────────── */

/** ISO → dd/mm/aaaa. Lo que no sea ISO vuelve vacío. */
export function deISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * dd/mm/aaaa → ISO, o '' si no es una fecha real.
 * El 31 de febrero se escribe igual de bien que el 28: la única forma de
 * saber si existe es construirla y ver si el Date devolvió lo mismo.
 */
export function aISO(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || '').trim());
  if (!m) return '';
  const dd = Number(m[1]); const mm = Number(m[2]); const aaaa = Number(m[3]);
  const d = new Date(aaaa, mm - 1, dd);
  if (d.getFullYear() !== aaaa || d.getMonth() !== mm - 1 || d.getDate() !== dd) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** La fecha local de un timestamp, en ISO. */
export function isoLocal(ms) {
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** La hora local de un timestamp, HH:MM. */
export function hmLocal(ms) {
  const d = new Date(Number(ms));
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** ISO + HH:MM → timestamp local, o null si falta alguno o no es válido. */
export function msDe(iso, hm) {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  const h = /^(\d{2}):(\d{2})$/.exec(String(hm || ''));
  if (!f || !h) return null;
  const d = new Date(Number(f[1]), Number(f[2]) - 1, Number(f[3]), Number(h[1]), Number(h[2]), 0, 0);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

export function campoFecha({ id, label, valor = '', hint = '' }) {
  return `<div class="ox-field">
    ${label ? `<label class="ox-field__label" for="${esc(id)}">${esc(label)}</label>` : ''}
    <input class="ox-input ox-input--mono" id="${esc(id)}" data-fecha
           inputmode="numeric" maxlength="10" spellcheck="false" autocomplete="off"
           placeholder="dd/mm/aaaa" value="${esc(deISO(valor))}"
           data-iso="${esc(valor || '')}">
    ${hint ? `<span class="ox-field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/** La fecha en ISO de un campo cableado, o '' si está vacío o incompleto. */
export function isoDe(input) {
  return input?.dataset.iso || '';
}

/**
 * Cablea todos los `[data-fecha]` que haya adentro de `raiz`.
 * La barra se inserta sola mientras se tipea: 05092026 → 05/09/2026.
 */
export function cablearFechas(raiz, onChange) {
  for (const input of raiz.querySelectorAll('input[data-fecha]')) {
    const formatear = () => {
      const alFinal = input.selectionStart === input.value.length;
      const d = input.value.replace(/\D/g, '').slice(0, 8);

      let texto = d;
      if (d.length > 4) texto = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
      else if (d.length > 2) texto = `${d.slice(0, 2)}/${d.slice(2)}`;

      if (texto !== input.value) {
        const pos = input.selectionStart;
        input.value = texto;
        /* La barra se inserta sola mientras se tipea. Si el cursor estaba al
           final se lo deja al final; si estaba en el medio se lo respeta, o
           cada barra automática lo mandaría al principio. */
        if (alFinal) input.setSelectionRange(texto.length, texto.length);
        else input.setSelectionRange(Math.min(pos, texto.length), Math.min(pos, texto.length));
      }

      const iso = aISO(texto);
      input.dataset.iso = iso;
      // Incompleta no es inválida: recién se marca cuando ya escribió los 8.
      input.classList.toggle('is-invalid', texto.length === 10 && !iso);
      onChange?.(iso, input);
    };

    input.addEventListener('input', formatear);
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.dataset.iso = '';
        input.classList.remove('is-invalid');
        onChange?.('', input);
      }
    });
  }
}

/* ── Hora ────────────────────────────────────────────────────────────────── */

/** «HH:MM» válida, o ''. Acepta también «H:MM» y «HHMM». */
export function aHM(texto) {
  const t = String(texto || '').trim();
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) {
    const d = /^(\d{2})(\d{2})$/.exec(t);
    if (d) m = [t, d[1], d[2]];
  }
  if (!m) return '';
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  return `${p2(h)}:${p2(mi)}`;
}

export function campoHora({ id, label, valor = '', hint = '' }) {
  return `<div class="ox-field">
    ${label ? `<label class="ox-field__label" for="${esc(id)}">${esc(label)}</label>` : ''}
    <input class="ox-input ox-input--mono" id="${esc(id)}" data-hora
           inputmode="numeric" maxlength="5" spellcheck="false" autocomplete="off"
           placeholder="HH:MM" value="${esc(valor)}" data-hm="${esc(aHM(valor))}">
    ${hint ? `<span class="ox-field__hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function hmDe(input) {
  return input?.dataset.hm || '';
}

/** Cablea los `[data-hora]`: 1400 → 14:00 mientras se tipea. */
export function cablearHoras(raiz, onChange) {
  for (const input of raiz.querySelectorAll('input[data-hora]')) {
    const formatear = () => {
      const alFinal = input.selectionStart === input.value.length;
      const d = input.value.replace(/\D/g, '').slice(0, 4);
      let texto = d;
      if (d.length > 2) texto = `${d.slice(0, 2)}:${d.slice(2)}`;
      if (texto !== input.value) {
        const pos = input.selectionStart;
        input.value = texto;
        if (alFinal) input.setSelectionRange(texto.length, texto.length);
        else input.setSelectionRange(Math.min(pos, texto.length), Math.min(pos, texto.length));
      }
      const hm = aHM(texto);
      input.dataset.hm = hm;
      input.classList.toggle('is-invalid', texto.length === 5 && !hm);
      onChange?.(hm, input);
    };
    input.addEventListener('input', formatear);
    input.addEventListener('blur', () => {
      // «9:30» al salir se normaliza a «09:30»; vacío queda vacío.
      const hm = aHM(input.value);
      if (hm) {
        input.value = hm; input.dataset.hm = hm; input.classList.remove('is-invalid');
        onChange?.(hm, input);
      } else if (!input.value.trim()) {
        input.dataset.hm = ''; input.classList.remove('is-invalid');
        onChange?.('', input);
      }
    });
  }
}

/* ── Momento: fecha + hora + «ahora» ─────────────────────────────────────────
   El caso de uso del tracker. Casi siempre la respuesta es «ahora», así que
   el botón está ahí; y cuando no, dos campos cortos que se tipean sin mouse. */

export function campoMomento({ id, label = 'Cuándo', ms = Date.now(), hint = '' }) {
  return `<div class="ox-field" data-momento="${esc(id)}">
    ${label ? `<label class="ox-field__label" for="${esc(id)}-fecha">${esc(label)}</label>` : ''}
    <div class="ap-momento">
      <input class="ox-input ox-input--mono" id="${esc(id)}-fecha" data-fecha
             inputmode="numeric" maxlength="10" spellcheck="false" autocomplete="off"
             placeholder="dd/mm/aaaa" value="${esc(deISO(isoLocal(ms)))}" data-iso="${esc(isoLocal(ms))}">
      <input class="ox-input ox-input--mono" id="${esc(id)}-hora" data-hora
             inputmode="numeric" maxlength="5" spellcheck="false" autocomplete="off"
             placeholder="HH:MM" value="${esc(hmLocal(ms))}" data-hm="${esc(hmLocal(ms))}">
      <button type="button" class="ox-btn ox-btn--ghost ox-flashable" data-ahora
              data-tip="Poner la fecha y hora actuales">${Icons.svg('ahora')} Ahora</button>
    </div>
    <span class="ox-field__hint ap-momento__hint" data-momento-hint>${esc(hint)}</span>
  </div>`;
}

/**
 * Cablea un `campoMomento`. Devuelve { leer(): ms|null, poner(ms), el }.
 * `onChange(ms|null)` se llama en cada cambio, válido o no.
 */
export function cablearMomento(raiz, id, onChange) {
  const wrap = raiz.querySelector(`[data-momento="${id}"]`);
  if (!wrap) return { leer: () => null, poner() {}, el: null };
  const fecha = wrap.querySelector('input[data-fecha]');
  const hora = wrap.querySelector('input[data-hora]');
  const hint = wrap.querySelector('[data-momento-hint]');

  const leer = () => msDe(isoDe(fecha), hmDe(hora));
  const avisar = () => {
    const ms = leer();
    /* Una toma en el futuro casi siempre es un typo (21:00 escrito por 12:00 a
       las 15). Se avisa, no se impide: hay quien anota la próxima. */
    if (hint) hint.textContent = ms != null && ms > Date.now() + 60_000 ? 'Esa hora todavía no llegó.' : '';
    onChange?.(ms);
  };
  cablearFechas(wrap, avisar);
  cablearHoras(wrap, avisar);

  const poner = (ms) => {
    fecha.value = deISO(isoLocal(ms)); fecha.dataset.iso = isoLocal(ms); fecha.classList.remove('is-invalid');
    hora.value = hmLocal(ms); hora.dataset.hm = hmLocal(ms); hora.classList.remove('is-invalid');
    avisar();
  };
  wrap.querySelector('[data-ahora]')?.addEventListener('click', () => poner(Date.now()));

  return { leer, poner, el: wrap };
}
