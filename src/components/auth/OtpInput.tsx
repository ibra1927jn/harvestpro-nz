/**
 * OtpInput — 6-box auto-advance OTP input
 *
 * Cada dígito ocupa su propio input. Se avanza automáticamente al siguiente
 * cuando se ingresa un dígito. Backspace regresa al anterior.
 * Soporta paste de 6 dígitos de golpe.
 */
import React, { useRef, useCallback } from 'react';
import { useTranslation } from '@/i18n';

interface OtpInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    hasError?: boolean;
}

const OtpInput: React.FC<OtpInputProps> = ({ value, onChange, disabled = false, hasError = false }) => {
    const { t } = useTranslation();
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

    const focusAt = useCallback((idx: number) => {
        const target = inputRefs.current[Math.max(0, Math.min(5, idx))];
        target?.focus();
        // Seleccionar todo para facilitar sobreescritura
        target?.select();
    }, []);

    const handleChange = useCallback((idx: number, raw: string) => {
        const digit = raw.replace(/\D/g, '').slice(-1);
        if (!digit) return;
        const next = value.slice(0, idx) + digit + value.slice(idx + 1);
        onChange(next);
        if (idx < 5) focusAt(idx + 1);
    }, [value, onChange, focusAt]);

    const handleKeyDown = useCallback((idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            if (digits[idx]) {
                // Borrar dígito actual
                onChange(value.slice(0, idx) + '' + value.slice(idx + 1));
            } else if (idx > 0) {
                // Si ya está vacío, retroceder
                onChange(value.slice(0, idx - 1) + '' + value.slice(idx));
                focusAt(idx - 1);
            }
        } else if (e.key === 'ArrowLeft') {
            focusAt(idx - 1);
        } else if (e.key === 'ArrowRight') {
            focusAt(idx + 1);
        }
    }, [digits, value, onChange, focusAt]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        onChange(pasted);
        // Foco al último dígito ingresado o al siguiente vacío
        focusAt(Math.min(5, pasted.length));
    }, [onChange, focusAt]);

    const boxBase = 'w-11 h-14 text-center text-xl font-black rounded-xl border-2 transition-all duration-150 focus:outline-none font-mono caret-transparent';
    const boxNormal = 'border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-text-main';
    const boxFilled = 'border-indigo-400 bg-indigo-50 text-indigo-700';
    const boxError = 'border-red-400 bg-red-50 text-red-700 animate-shake';
    const boxDisabled = 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed';

    return (
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
                <input
                    key={idx}
                    ref={el => { inputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]"
                    maxLength={1}
                    value={digit}
                    disabled={disabled}
                    autoFocus={idx === 0}
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    aria-label={t('ui.otp_digit', { n: idx + 1 })}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onFocus={(e) => e.target.select()}
                    className={`${boxBase} ${disabled ? boxDisabled : hasError ? boxError : digit ? boxFilled : boxNormal}`}
                />
            ))}
        </div>
    );
};

export default OtpInput;
