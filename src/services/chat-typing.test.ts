/**
 * «Escribiendo…»: como mucho un aviso cada 3 s y se apaga a los 5 s sin avisos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TYPING_THROTTLE_MS, TYPING_TIMEOUT_MS, createTypingSender, createTypingWatcher } from './chat-typing';

describe('createTypingSender', () => {
    it('sends at most one event every 3 s while typing', () => {
        let now = 0;
        const send = vi.fn();
        const sender = createTypingSender(send, () => now);
        sender.onInput('h');
        sender.onInput('he');
        now = TYPING_THROTTLE_MS - 1;
        sender.onInput('hel');
        expect(send).toHaveBeenCalledTimes(1);
        now = TYPING_THROTTLE_MS;
        sender.onInput('hell');
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('does not announce an empty box, and after sending the next key announces again', () => {
        let now = 1000;
        const send = vi.fn();
        const sender = createTypingSender(send, () => now);
        sender.onInput('   ');
        expect(send).not.toHaveBeenCalled();
        sender.onInput('ok');
        sender.reset();
        now += 10;
        sender.onInput('n');
        expect(send).toHaveBeenCalledTimes(2);
    });
});

describe('createTypingWatcher', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows a person until 5 s after their last event', () => {
        const onChange = vi.fn();
        const w = createTypingWatcher(onChange);
        w.seen('u2');
        expect(onChange).toHaveBeenLastCalledWith(['u2']);
        vi.advanceTimersByTime(TYPING_TIMEOUT_MS - 1000);
        w.seen('u2'); // sigue escribiendo: no se vuelve a avisar, se alarga
        expect(onChange).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(TYPING_TIMEOUT_MS - 1);
        expect(onChange).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it('their message turns it off at once; clear() stops everything', () => {
        const onChange = vi.fn();
        const w = createTypingWatcher(onChange);
        w.seen('u2');
        w.seen('u3');
        expect(onChange).toHaveBeenLastCalledWith(['u2', 'u3']);
        w.stop('u2');
        expect(onChange).toHaveBeenLastCalledWith(['u3']);
        w.stop('nobody');
        expect(onChange).toHaveBeenCalledTimes(3);
        w.clear();
        expect(onChange).toHaveBeenLastCalledWith([]);
        vi.advanceTimersByTime(TYPING_TIMEOUT_MS * 2);
        expect(onChange).toHaveBeenCalledTimes(4);
    });
});
