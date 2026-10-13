/**
 * LiveAnnouncer — regiones aria-live persistentes (invisibles) para announce().
 * Montar una sola vez, en la raíz de la app.
 */
import React, { useEffect, useRef, useState } from 'react';
import { subscribeAnnouncer, type Politeness } from '@/services/announcer';

const LiveAnnouncer: React.FC = () => {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeAnnouncer((message: string, politeness: Politeness) => {
      const set = politeness === 'assertive' ? setAssertive : setPolite;
      // Vaciar y volver a escribir: así se repite un mensaje igual al anterior
      set('');
      timers.current.push(setTimeout(() => set(message), 50));
    });
    const pending = timers.current;
    return () => {
      unsubscribe();
      pending.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-polite">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" data-testid="live-assertive">
        {assertive}
      </div>
    </>
  );
};

export default LiveAnnouncer;
