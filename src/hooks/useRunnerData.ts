/**
 * useRunnerData — Data loading + scan handlers for the Runner page
 *
 * Extracts store access, polling, scan logic, and quality submission
 * from Runner.tsx following the usePayroll pattern.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useMessaging } from '@/context/MessagingContext';
import { useAuth } from '@/context/AuthContext';
import { offlineService } from '@/services/offline.service';
import { onLocalDbChange } from '@/services/dbChanges';
import { feedbackService } from '@/services/feedback.service';
import { nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { type Bin, type Picker } from '@/types/app.types';
import { createTransportRequest } from '@/services/logistics-dept.service';
import { binService, bucketsInBin } from '@/services/bin.service';
import { MAX_BUCKETS_PER_BIN, Role } from '@/types/app.types';
import { bucketSavedAnnouncement, isOnlineNow } from './runnerAnnouncements';
import { useTranslation } from '@/i18n';

export interface DisplayInventory {
  [key: string]: unknown;
  full_bins: number;
  empty_bins: number;
  in_progress: number;
  total: number;
  raw: Bin[];
}

export interface RejectedScan {
  id: string;
  picker_id: string;
  timestamp: string;
  reason: string;
}

export interface UseRunnerDataResult {
  inventory: DisplayInventory;
  orchard: { id: string; name?: string; total_rows?: number } | null;
  crew: Picker[];
  selectedBinId: string | undefined;
  pendingUploads: number;
  /** Escaneos que el servidor no aceptó (semana/día cerrado, tarjeta desconocida…) */
  rejectedScans: RejectedScan[];
  showScanner: boolean;
  scanType: 'BIN' | 'BUCKET';
  toast: { message: string; type: 'success' | 'error' | 'info' | 'warning'; announcement?: string } | null;
  setSelectedBinId: (id: string | undefined) => void;
  setShowScanner: (show: boolean) => void;
  setToast: (
    toast: { message: string; type: 'success' | 'error' | 'info' | 'warning'; announcement?: string } | null
  ) => void;
  handleScanClick: (type?: 'BIN' | 'BUCKET') => void;
  handleBroadcast: (message: string) => Promise<void>;
  handleRequestRefill: () => Promise<void>;
  handleScanComplete: (scannedData: string | string[]) => void;
}

export function useRunnerData(): UseRunnerDataResult {
  const { t } = useTranslation();
  const rawInventory = useHarvestStore(state => state.inventory);
  const orchard = useHarvestStore(state => state.orchard);
  const crew = useHarvestStore(state => state.crew);
  const addBucket = useHarvestStore(state => state.addBucket);
  const dayClosed = useHarvestStore(state => state.dayClosed);
  const { sendBroadcast } = useMessaging();
  const setGlobalState = useHarvestStore(state => state.setGlobalState);

  // Cambia el estado de un bin en pantalla al momento; al servidor va por la cola offline
  const setBinStatus = useCallback(
    (binId: string, status: Bin['status']) => {
      const inv = useHarvestStore.getState().inventory;
      setGlobalState({
        inventory: inv.map(b =>
          b.id === binId
            ? { ...b, status, ...(status === 'full' ? { sunExposureStart: Date.now() } : {}) }
            : b
        ),
      });
      binService.updateBinStatus(binId, status).catch(e =>
        logger.warn('[Runner] Bin status not queued:', e)
      );
    },
    [setGlobalState]
  );

  const [selectedBinId, setSelectedBinId] = useState<string | undefined>(undefined);
  const [pendingUploads, setPendingUploads] = useState<number>(0);
  const [rejectedScans, setRejectedScans] = useState<RejectedScan[]>([]);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [scanType, setScanType] = useState<'BIN' | 'BUCKET'>('BUCKET');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    /** Texto completo para lector de pantalla (nombre del picker, sin cobertura) */
    announcement?: string;
  } | null>(null);

  // Poll for pending uploads — 5s interval, pauses when tab is hidden
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        const count = await offlineService.getPendingCount();
        setPendingUploads(count);
        // Rechazados: siguen en el móvil (también tras reabrir la app) y se enseñan
        const errors = await offlineService.getErrorItems().catch(() => null);
        if (!errors) return;
        setRejectedScans(prev =>
          prev.length === errors.length && prev.every((p, i) => p.id === errors[i].id)
            ? prev
            : errors.map(e => ({
                id: e.id,
                picker_id: e.picker_id,
                timestamp: e.timestamp,
                reason: e.failure_reason || 'Rejected',
              }))
        );
      }
    };
    poll();
    // Se relee cuando cambia la BD local (escaneo, sincronización), no cada 5 s
    return onLocalDbChange(poll);
  }, []);

  const handleScanClick = useCallback((type: 'BIN' | 'BUCKET' = 'BUCKET') => {
    feedbackService.vibrate(50);
    setScanType(type);
    setShowScanner(true);
  }, []);

  const handleBroadcast = useCallback(
    async (message: string) => {
      feedbackService.vibrate(50);
      // Igual que antes del cambio de destinatarios por defecto: a team leaders y runners
      const ok = await sendBroadcast('Runner Request', message, 'normal', [Role.TEAM_LEADER, Role.RUNNER]);
      setToast(ok
        ? { message: t('runner.toast.broadcast_sent'), type: 'success' }
        : { message: t('runner.toast.broadcast_failed'), type: 'error' });
    },
    [sendBroadcast, t]
  );

  // Pedir bins vacíos: crea una petición de transporte que Logística ve en
  // "Requests" (funciona sin conexión: se sube al volver la red) y avisa.
  const { appUser } = useAuth();
  const currentUser = appUser ? { id: appUser.id, name: appUser.full_name } : null;
  const handleRequestRefill = useCallback(async () => {
    feedbackService.vibrate(50);
    if (!orchard?.id || !currentUser?.id) {
      setToast({ message: t('runner.toast.no_orchard_for_request'), type: 'error' });
      return;
    }
    const me = crew.find(p => p.id === currentUser.id);
    const row = me?.current_row && me.current_row > 0 ? me.current_row : undefined;
    // zone se guarda en la petición (dato para Logística); en pantalla va traducida
    const zone = row ? `Row ${row}` : (orchard.name || 'Orchard');
    const zoneLabel = row ? t('runner.row_n', { n: row }) : (orchard.name || t('runner.orchard'));
    try {
      await createTransportRequest({
        orchard_id: orchard.id,
        requested_by: currentUser.id,
        requester_name: currentUser.name || 'Runner',
        zone,
        bins_count: 1,
        priority: 'normal',
        notes: 'Empty bins requested from runner app',
      });
      setToast({ message: t('runner.toast.bin_request_sent', { zone: zoneLabel }), type: 'success' });
      // Logística la ve al momento por realtime (transport_requests). Ya no se
      // manda además un aviso: los avisos son solo de manager/admin (RLS) y el
      // del runner fallaba siempre con 403 (prueba de carga 2026-10-21).
    } catch (e) {
      logger.error('[Runner] Refill request failed:', e);
      setToast({ message: t('runner.toast.bin_request_failed'), type: 'error' });
    }
  }, [orchard?.id, orchard?.name, currentUser?.id, currentUser?.name, crew, t]);

  // Fila del picker: la que tiene asignada en el mapa, o su fila actual
  const rowAssignments = useHarvestStore(s => s.rowAssignments);
  const rowOf = useCallback(
    (pickerId: string, currentRow?: number): number | undefined => {
      const assigned = rowAssignments.find(r => r.assigned_pickers?.includes(pickerId));
      const row = assigned?.row_number ?? currentRow;
      return row && row > 0 ? row : undefined;
    },
    [rowAssignments]
  );

  /**
   * "Saving…" al momento y "Saved" solo cuando las cubetas ya están en el
   * móvil (IndexedDB). Si la app se cierra antes, el runner no vio "Saved".
   */
  const confirmSaved = useCallback((saves: Promise<boolean>[], names: string[]) => {
    setToast({ message: t('runner.toast.saving', { n: saves.length }), type: 'info' });
    void Promise.all(saves.map(p => Promise.resolve(p).catch(() => false))).then(results => {
      const ok = results.filter(r => r === true).length;
      const savedFor = names.filter((_, i) => results[i] === true);
      const notSaved = results.length - ok;
      if (ok > 0) feedbackService.triggerSuccess();
      if (notSaved === 0) {
        setToast({
          message: t('runner.toast.saved', { n: ok }),
          type: 'success',
          announcement: bucketSavedAnnouncement(savedFor, isOnlineNow(), t),
        });
      } else {
        setToast({
          message: ok > 0
            ? t('runner.toast.not_saved_some', { n: notSaved, ok })
            : t('runner.toast.not_saved', { n: notSaved }),
          type: 'error',
        });
      }
    });
  }, [t]);

  const handleScanComplete = useCallback(
    (scannedData: string | string[]) => {
      setShowScanner(false);
      if (!scannedData || (Array.isArray(scannedData) && scannedData.length === 0)) return;

      const codes = Array.isArray(scannedData) ? scannedData : [scannedData];

      if (scanType === 'BIN') {
        const binCode = codes[0].trim();
        const bin = rawInventory?.find(b => b.bin_code === binCode || b.id === binCode);
        if (bin) {
          if (bin.status === 'full' || bin.status === 'collected') {
            setToast({
              message: t(bin.status === 'full' ? 'runner.toast.bin_is_full' : 'runner.toast.bin_is_collected', { code: bin.bin_code || '' }),
              type: 'warning',
            });
            return;
          }
          setSelectedBinId(bin.id);
          feedbackService.vibrate(100);
          setToast({ message: t('runner.toast.bin_active', { code: bin.bin_code || '' }), type: 'info' });
          // Vacío → en uso
          if (bin.status === 'empty') {
            setBinStatus(bin.id, 'in-progress');
          }
        } else if (orchard?.id && binCode) {
          // Bin nuevo (pegatina sin registrar): se da de alta ya en uso
          binService.registerBin(orchard.id, binCode).then(newBin => {
            setGlobalState({ inventory: [...useHarvestStore.getState().inventory, newBin] });
            setSelectedBinId(newBin.id);
            feedbackService.vibrate(100);
            setToast({ message: t('runner.toast.bin_registered', { code: binCode }), type: 'info' });
          });
        } else {
          setToast({ message: t('runner.toast.bin_not_found'), type: 'error' });
        }
        return;
      }

      // Día cerrado por el manager: la BD rechazaría las cubetas. Se avisa claro
      // («El día está cerrado») en vez de «guardada» y luego «escaneo rechazado»
      if (dayClosed) {
        feedbackService.triggerError();
        setToast({ message: t('close.scan_blocked'), type: 'error' });
        return;
      }

      // BATCH MODO O MODO ESTÁNDAR: Procesar todos los tickets en memoria (Buckets)
      const saves: Promise<boolean>[] = [];
      const savedFor: string[] = [];
      codes.forEach(code => {
        const picker = crew.find(p => p.id === code || p.picker_id === code);
        if (!picker) {
          logger.warn(`Picker ${code} not checked in.`);
          return; // ignora los que no están checked in
        }

        // La nota de calidad la da QC (inspecciones de qc_inspections), no el runner:
        // la cubeta se guarda con 'A' y el runner no califica (decisión 2026-10-23;
        // el QualityRatingModal nunca se mostraba y se quitó).
        savedFor.push(picker.name || picker.picker_id || code);
        saves.push(addBucket({
          picker_id: code,
          quality_grade: 'A',
          timestamp: nowNZST(),
          orchard_id: orchard?.id || 'offline_pending',
          row_number: rowOf(picker.id, picker.current_row),
          bin_id: selectedBinId || null,
        }));
      });

      if (saves.length > 0) {
        confirmSaved(saves, savedFor);
      } else if (codes.length > 0) {
        setToast({
          message: `⚠️ ${t('runner.toast.not_checked_in')}`,
          type: 'warning',
        });
      }
    },
    [scanType, rawInventory, crew, addBucket, orchard?.id, rowOf, selectedBinId, setBinStatus, setGlobalState, confirmSaved, t, dayClosed]
  );


  // Calculate real inventory data from context
  // Llenado del bin activo: al llegar a la capacidad pasa a lleno y se suelta
  const localBuckets = useHarvestStore(state => state.buckets);
  const bucketRecords = useHarvestStore(state => state.bucketRecords);
  const bucketsInActiveBin = useMemo(
    () => bucketsInBin(selectedBinId, localBuckets, bucketRecords),
    [selectedBinId, localBuckets, bucketRecords]
  );
  useEffect(() => {
    if (!selectedBinId || bucketsInActiveBin < MAX_BUCKETS_PER_BIN) return;
    const bin = useHarvestStore.getState().inventory.find(b => b.id === selectedBinId);
    setBinStatus(selectedBinId, 'full');
    setSelectedBinId(undefined);
    feedbackService.triggerSuccess();
    setToast({ message: t('runner.toast.bin_now_full', { code: bin?.bin_code || '', max: MAX_BUCKETS_PER_BIN }), type: 'info' });
  }, [selectedBinId, bucketsInActiveBin, setBinStatus, t]);

  const inventory = useMemo<DisplayInventory>(() => {
    const full = (rawInventory || []).filter(b => b.status === 'full').length;
    const empty = (rawInventory || []).filter(b => b.status === 'empty').length;
    const inProgress = (rawInventory || []).filter(b => b.status === 'in-progress').length;

    return {
      full_bins: full,
      empty_bins: empty,
      in_progress: inProgress,
      total: (rawInventory || []).length || 50,
      raw: rawInventory || [],
    };
  }, [rawInventory]);

  return {
    inventory,
    orchard,
    crew,
    selectedBinId,
    pendingUploads,
    rejectedScans,
    showScanner,
    scanType,
    toast,
    setSelectedBinId,
    setShowScanner,
    setToast,
    handleScanClick,
    handleBroadcast,
    handleRequestRefill,
    handleScanComplete,
  };
}
