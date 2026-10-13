/**
 * StoragePersistBanner — Banner de advertencia de almacenamiento no persistente.
 *
 * Se muestra cuando el navegador NO otorgó almacenamiento persistente al arrancar
 * (sessionStorage flag 'harvest_storage_risk'). Esto significa que el OS puede
 * borrar los datos offline (IndexedDB/Dexie) bajo presión de almacenamiento.
 *
 * Solo visible en web no-instalado. En Capacitor Android el storage siempre es
 * persistente y esta flag nunca se establece.
 *
 * Se descarta con el botón X — permanece descartado durante toda la sesión.
 * El texto respeta el idioma activo de la app (i18n).
 */
import { useState } from 'react';
import { useTranslation } from '@/i18n';

const RISK_FLAG = 'harvest_storage_risk';
const DISMISSED_FLAG = 'harvest_storage_risk_dismissed';

export function StoragePersistBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    // Mostrar solo si hay riesgo Y no fue descartado en esta sesión
    return (
      sessionStorage.getItem(RISK_FLAG) === '1' &&
      sessionStorage.getItem(DISMISSED_FLAG) !== '1'
    );
  });

  if (!visible) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_FLAG, '1');
    setVisible(false);
  };

  return (
    <div
      role="alert"
      // En el flujo (no fixed): antes tapaba el header y sus botones en el móvil
      className="relative z-40 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium shadow-md"
    >
      <span>
        ⚠️ {t('pwa.storage_warning')}
      </span>
      <button
        onClick={handleDismiss}
        aria-label={t('common.close')}
        className="ml-4 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-800"
      >
        ✕
      </button>
    </div>
  );
}
