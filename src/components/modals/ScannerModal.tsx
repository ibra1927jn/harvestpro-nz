import { logger } from '@/utils/logger';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import QrScanner from 'qr-scanner';
import qrScannerWorkerPath from 'qr-scanner/qr-scanner-worker.min.js?url';
import { useScanRateLimit } from '@/hooks/useScanRateLimit';
import { nativeScannerService } from '@/services/native-scanner.service';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { announce } from '@/services/announcer';
import { useTranslation } from '@/i18n';

// Configura la ruta del worker para que Vite pueda servirlo sin eval()
QrScanner.WORKER_PATH = qrScannerWorkerPath;

interface ScannerModalProps {
  onClose: () => void;
  onScan: (code: string) => void;
  scanType: 'BIN' | 'BUCKET';
  batchMode?: boolean;
  onBatchScan?: (codes: string[]) => void;
}

const ScannerModal: React.FC<ScannerModalProps> = ({
  onClose,
  onScan,
  scanType,
  batchMode = false,
  onBatchScan,
}) => {
  const { t } = useTranslation();
  const isBin = scanType === 'BIN';
  const [manualCode, setManualCode] = useState('');
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isNative] = useState(() => nativeScannerService.isNativePlatform());
  const [nativeScanning, setNativeScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Lote actual fuera del updater de estado (para anunciar sin efectos en el updater)
  const batchRef = useRef<string[]>([]);

  // Teclado / lector de pantalla: foco dentro, Tab atrapado, Escape cierra, foco de vuelta
  useDialogA11y(dialogRef, { onClose });

  // 🔊 Audio Feedback helper
  const playSuccessFeedback = useCallback(() => {
    try {
      if (navigator.vibrate) navigator.vibrate(50);
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = 800; // 800Hz beep
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (_e) {
      // Silence if audio context blocked
    }
  }, []);

  // 🔧 Intelligent rate limiting — same code = 3s block, different code = 500ms debounce
  const { handleScan: rateLimitedScan } = useScanRateLimit(
    (code: string) => {
      if (batchMode) {
        if (batchRef.current.includes(code)) return; // Exclude duplicates within the same batch
        batchRef.current = [code, ...batchRef.current];
        setScannedCodes(batchRef.current);
        setShowSuccess(true);
        playSuccessFeedback();
        setTimeout(() => setShowSuccess(false), 500); // Shorter success visual for batch
        const n = batchRef.current.length;
        announce(t(n === 1 ? 'runner.scanner.sr_batch_added_one' : 'runner.scanner.sr_batch_added_other', { code, n }));
      } else {
        setShowSuccess(true);
        playSuccessFeedback();
        setTimeout(() => setShowSuccess(false), 1500);
        announce(t('runner.scanner.sr_scanned', { code }));
        onScan(code);
      }
    },
    { sameScanCooldownMs: 3000, globalDebounceMs: 500 }
  );

  // ── Native Scanner Flow ──────────────────────
  const startNativeScan = useCallback(async () => {
    setNativeScanning(true);
    try {
      const result = await nativeScannerService.scanNative();
      if (result) {
        rateLimitedScan(result.code);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Native scanner failed';
      logger.error('[Scanner] Native scan error:', msg);
      setCameraError(msg);
    } finally {
      setNativeScanning(false);
    }
  }, [rateLimitedScan]);

  // ── Web Scanner Flow (qr-scanner — CSP-compatible, sin eval()) ──────────
  useEffect(() => {
    // Skip web scanner if native or manual mode
    if (isNative || showManual) return;
    if (!videoRef.current) return;

    let scanner: QrScanner | null = null;

    const initScanner = async () => {
      try {
        scanner = new QrScanner(videoRef.current!, result => rateLimitedScan(result.data), {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 10,
          // Desactivar overlay de debug para mantener UI limpia
          returnDetailedScanResult: true,
        });
        await scanner.start();
      } catch (e) {
        // FIX H2: Camera init failure — auto-switch to manual
        const message = e instanceof Error ? e.message : 'Camera not available';
        logger.error('[Scanner] Camera init failed:', message);
        setCameraError(message);
        setShowManual(true);
      }
    };

    initScanner();

    return () => {
      scanner?.stop();
      scanner?.destroy();
    };
  }, [showManual, rateLimitedScan, isNative]);

  // ── Cleanup native scanner on unmount ─────────
  useEffect(() => {
    return () => {
      if (isNative) {
        nativeScannerService.stopNativeScan();
      }
    };
  }, [isNative]);

  // ── Auto-start native scan when modal opens ───
  useEffect(() => {
    if (isNative && !showManual && !nativeScanning) {
      startNativeScan();
    }
  }, [isNative, showManual, nativeScanning, startNativeScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      rateLimitedScan(manualCode.trim().toUpperCase());
      setManualCode('');
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t(isBin ? 'runner.scanner.title_bin' : 'runner.scanner.title_bucket')}
      className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-200"
    >
      {/* Header */}
      {/* En el flujo (antes absolute): con poca altura — landscape o teclado abierto — se pisaba con el formulario */}
      <div className="shrink-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {t(isBin ? 'runner.scanner.title_bin' : 'runner.scanner.title_bucket')}
            {isNative && (
              <span className="px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[10px] font-bold text-emerald-400">
                {t('scanner.native')}
              </span>
            )}
          </h2>
          <p className="text-xs text-text-disabled">
            {isNative ? t('scanner.hardware_accelerated') : t('scanner.align_qr')}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t('runner.scanner.close')}
          className="size-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white"
        >
          <span aria-hidden="true" className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Camera Error Banner */}
      {cameraError && (
        <div role="alert" className="absolute top-20 left-4 right-4 z-20 bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-xl flex items-center gap-3">
          <span aria-hidden="true" className="material-symbols-outlined text-xl">videocam_off</span>
          <div>
            <p className="text-sm font-bold">{t('scanner.camera_unavailable')}</p>
            <p className="text-xs opacity-80">{t('runner.scanner.use_manual')}</p>
          </div>
        </div>
      )}

      {/* ✅ Scan Success Feedback */}
      {showSuccess && (
        <div className="absolute top-20 left-4 right-4 z-20 bg-emerald-500/90 backdrop-blur-md text-white px-4 py-3 rounded-xl flex items-center gap-3 animate-slide-down">
          <span aria-hidden="true" className="material-symbols-outlined text-xl">check_circle</span>
          <div>
            <p className="text-sm font-bold">{t('scanner.scanned')}</p>
            <p className="text-xs opacity-80">{t('scanner.code_registered')}</p>
          </div>
        </div>
      )}

      {/* Contenido con scroll propio: lista del lote + cámara / entrada manual */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col justify-center gap-3 py-2">
          {/* Scanner Area */}
          <div className="w-full max-w-lg mx-auto relative px-4">
            {showManual ? (
              <form
                onSubmit={handleManualSubmit}
                className="bg-black/80 backdrop-blur-md p-6 rounded-2xl border border-white/10"
              >
                <label htmlFor="scanner-manual-code" className="block text-sm font-medium text-text-muted mb-2">
                  {t(isBin ? 'runner.scanner.enter_code_bin' : 'runner.scanner.enter_code_bucket')}
                </label>
                <input
                  id="scanner-manual-code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value.toUpperCase())}
                  className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white font-mono text-lg focus:border-primary outline-none mb-4"
                  placeholder={t('runner.scanner.code_example', { code: 'BKT-1024' })}
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl active:scale-95 transition-transform"
                >
                  {t('scanner.submit_code')}
                </button>
              </form>
            ) : isNative ? (
              /* Native scanner — Capacitor handles the camera feed */
              <div className="bg-black/80 backdrop-blur-md p-8 rounded-2xl border border-white/10 text-center">
                {nativeScanning ? (
                  <>
                    <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white font-semibold">{t('runner.scanner.native_active')}</p>
                    <p className="text-sm text-white/60 mt-1">{t('runner.scanner.point_camera')}</p>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" className="material-symbols-outlined text-5xl text-emerald-400 mb-4 block">
                      qr_code_scanner
                    </span>
                    <button
                      onClick={startNativeScan}
                      className="bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl active:scale-95 transition-transform"
                    >
                      {t('scanner.scan_again')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Web scanner — qr-scanner (CSP-compatible, sin eval) */
              <div className="rounded-2xl overflow-hidden bg-black border border-white/20 shadow-2xl relative">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover rounded-2xl"
                  style={{ minHeight: 280 }}
                />
              </div>
            )}
          </div>
          {/* Batch List UI: debajo del campo, para que el campo quede a la vista */}
          {batchMode && scannedCodes.length > 0 && (
            <div className="mx-4 max-h-48 overflow-y-auto bg-black/60 backdrop-blur-md rounded-xl border border-white/20 p-3 custom-scrollbar">
              <h3 className="text-white text-xs font-bold mb-2 px-1 uppercase tracking-wider">
                {t('runner.scanner.batch_count', { n: scannedCodes.length })}
              </h3>
              <div className="flex flex-col gap-1.5">
                {scannedCodes.map(code => (
                  <div
                    key={code}
                    className="flex items-center justify-between bg-emerald-500/20 px-3 py-2 rounded-lg border border-emerald-500/30"
                  >
                    <span className="text-white font-mono font-bold text-sm tracking-widest">
                      {code}
                    </span>
                    <span aria-hidden="true" className="material-symbols-outlined text-emerald-400 text-sm">
                      check_circle
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions: en el flujo, siempre debajo del contenido */}
      <div className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 z-30">
        <button
          onClick={() => {
            setShowManual(!showManual);
            setCameraError(null);
          }}
          className="text-sm font-medium text-white/80 underline decoration-white/30 underline-offset-4 pointer-events-auto"
        >
          {showManual ? t('scanner.switch_camera') : t('scanner.problem_scanning')}
        </button>
        {/* Batch Done Button */}
        {batchMode && scannedCodes.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => {
                if (onBatchScan) onBatchScan(scannedCodes);
                onClose();
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span aria-hidden="true" className="material-symbols-outlined">done_all</span>
              {t('runner.scanner.complete_batch', { n: scannedCodes.length })}
            </button>
          </div>
        )}
      </div>

      <style>{`
                /* Native scanner: transparent body for camera preview */
                body.scanner-active { background: transparent !important; }
                body.scanner-active > *:not(.scanner-overlay) { opacity: 0.1; }
            `}</style>
    </div>
  );
};

export default ScannerModal;
