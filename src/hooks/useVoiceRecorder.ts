/**
 * useVoiceRecorder — nota de voz con MediaRecorder.
 *
 * webm/opus donde se puede (Chrome, Android, Firefox); en Safari / iOS,
 * mp4/aac. Para sola a los 2 minutos. stop() devuelve el audio y su duración;
 * cancel() lo tira. Si se deniega el micrófono, error = 'denied'.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VOICE_MS } from '@/services/chat-attachments.service';
import { logger } from '@/utils/logger';

export type VoiceRecorderError = 'denied' | 'unsupported' | 'failed';

// Códigos (no textos de pantalla): la pantalla los traduce
const E_DENIED: VoiceRecorderError = 'denied';
const E_UNSUPPORTED: VoiceRecorderError = 'unsupported';
const E_FAILED: VoiceRecorderError = 'failed';

export interface VoiceRecording {
    blob: Blob;
    mime: string;
    durationMs: number;
}

/** Formatos por orden de preferencia */
const CANDIDATE_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];

/** Primer formato que este navegador sabe grabar ('' = el que elija el navegador) */
export function pickRecorderMime(): string {
    const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined;
    if (!MR || typeof MR.isTypeSupported !== 'function') return '';
    return CANDIDATE_MIMES.find(m => MR.isTypeSupported(m)) ?? '';
}

export function useVoiceRecorder(maxMs: number = MAX_VOICE_MS) {
    const [isRecording, setIsRecording] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [error, setError] = useState<VoiceRecorderError | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Quien espera el resultado de stop() (o del corte automático a los 2 min)
    const resolveRef = useRef<((r: VoiceRecording | null) => void) | null>(null);
    const discardRef = useRef(false);
    const onAutoStopRef = useRef<((r: VoiceRecording) => void) | null>(null);

    const cleanup = useCallback(() => {
        if (tickRef.current) clearInterval(tickRef.current);
        if (limitRef.current) clearTimeout(limitRef.current);
        tickRef.current = null;
        limitRef.current = null;
        streamRef.current?.getTracks().forEach(tr => tr.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
    }, []);

    useEffect(() => () => {
        // Al salir de la pantalla se tira lo que se estuviera grabando
        discardRef.current = true;
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        cleanup();
    }, [cleanup]);

    /** Empieza a grabar. onAutoStop recibe la nota si se corta sola al llegar al máximo. */
    const start = useCallback(async (onAutoStop?: (r: VoiceRecording) => void): Promise<boolean> => {
        if (recorderRef.current) return true;
        setError(null);
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setError(E_UNSUPPORTED);
            return false;
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            const name = (e as { name?: string })?.name ?? '';
            setError(name === 'NotAllowedError' || name === 'SecurityError' ? E_DENIED : E_FAILED);
            logger.warn('[Voice] Microphone not available:', e);
            return false;
        }
        const mime = pickRecorderMime();
        let recorder: MediaRecorder;
        try {
            recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        } catch (e) {
            stream.getTracks().forEach(tr => tr.stop());
            setError(E_UNSUPPORTED);
            logger.warn('[Voice] MediaRecorder failed to start:', e);
            return false;
        }
        streamRef.current = stream;
        recorderRef.current = recorder;
        chunksRef.current = [];
        discardRef.current = false;
        onAutoStopRef.current = onAutoStop ?? null;

        recorder.ondataavailable = ev => {
            if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
            const durationMs = Math.min(Date.now() - startedAtRef.current, maxMs);
            const type = recorder.mimeType || mime || 'audio/webm';
            const blob = new Blob(chunksRef.current, { type });
            const result = discardRef.current || blob.size === 0 ? null : { blob, mime: type, durationMs };
            const resolve = resolveRef.current;
            resolveRef.current = null;
            cleanup();
            if (resolve) resolve(result);
            else if (result && onAutoStopRef.current) onAutoStopRef.current(result);
        };

        startedAtRef.current = Date.now();
        setElapsedMs(0);
        recorder.start(1000);
        setIsRecording(true);
        tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
        // Corte automático a los 2 minutos: la nota se envía igual
        limitRef.current = setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop();
        }, maxMs);
        return true;
    }, [cleanup, maxMs]);

    /** Para y devuelve la nota (null si no hay audio) */
    const stop = useCallback((): Promise<VoiceRecording | null> => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
        return new Promise(resolve => {
            resolveRef.current = resolve;
            discardRef.current = false;
            recorder.stop();
        });
    }, []);

    /** Para y tira lo grabado */
    const cancel = useCallback(() => {
        const recorder = recorderRef.current;
        discardRef.current = true;
        resolveRef.current = null;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        else cleanup();
    }, [cleanup]);

    return { isRecording, elapsedMs, error, clearError: () => setError(null), start, stop, cancel };
}
