/**
 * Marca <html class="icons-ready"> cuando la fuente de iconos está lista.
 * Hasta entonces el CSS oculta el texto del ligado (ver index.css), para que en
 * 3G no se vean palabras como "local_shipping" ni salte el layout.
 *
 * También arranca la descarga de la fuente en paralelo con los chunks de la ruta,
 * sin esperar a que React pinte el primer icono. Si la carga falla (sin red y sin
 * caché) se marca igualmente: mejor ver el nombre que un hueco vacío.
 */
export const ICON_FONT = '24px "Material Symbols Outlined"';

export function markWhenIconFontReady(doc: Document = document): Promise<void> {
  const root = doc.documentElement;
  const done = () => {
    root.classList.add('icons-ready');
  };
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') {
    done();
    return Promise.resolve();
  }
  // 'home' fuerza la descarga del fichero (cualquier glifo del subset sirve)
  return fonts.load(ICON_FONT, 'home').then(done, done);
}
