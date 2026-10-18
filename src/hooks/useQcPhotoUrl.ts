/**
 * Fotos de QC en bucket privado (migración 20261018000000).
 * En qc_inspections.photo_url se guarda la ruta del fichero ("orchard/fecha/uuid.webp").
 * Las inspecciones antiguas guardaban el enlace público; de ese enlace se saca la ruta.
 * Para mostrarlas se pide un enlace firmado que caduca.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';

export const QC_PHOTOS_BUCKET = 'qc-photos';
const SIGNED_URL_SECONDS = 60 * 60;
const PUBLIC_MARKER = `/storage/v1/object/public/${QC_PHOTOS_BUCKET}/`;

/** Ruta dentro del bucket a partir de lo guardado (ruta nueva o enlace público antiguo) */
export function qcPhotoPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const i = stored.indexOf(PUBLIC_MARKER);
  if (i >= 0) return decodeURIComponent(stored.slice(i + PUBLIC_MARKER.length).split('?')[0]);
  if (/^https?:\/\//i.test(stored) || stored.startsWith('data:') || stored.startsWith('blob:'))
    return null;
  return stored.replace(/^\/+/, '');
}

/** Enlace firmado para mostrar la foto (null mientras carga o si no hay acceso) */
export function useQcPhotoUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    const path = qcPhotoPath(stored);
    if (!path) {
      // Enlaces que no son del bucket (datos de prueba, blob local): se muestran tal cual
      if (stored && !stored.includes(PUBLIC_MARKER)) setUrl(stored);
      return;
    }
    supabase.storage
      .from(QC_PHOTOS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.warn('[QC] Could not sign photo URL:', error.message);
          return;
        }
        setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [stored]);
  return url;
}
