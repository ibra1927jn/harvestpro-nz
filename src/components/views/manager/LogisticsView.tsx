/**
 * LogisticsView — Logística del manager en UNA sola pantalla.
 *
 * Arriba, el resumen de salud (semáforo, bins pendientes, SLA de recogida,
 * ranking de runners, eventos) y debajo la logística completa (flota,
 * solicitudes, bins, historial: `LogisticsWorkspace`, el mismo cuerpo que la
 * página del rol Logística). Sin botón a otra página: el commit d5ce6e3
 * (2026-04-14) la había partido en dos y el dueño pidió volver a una (21-10).
 */
import React, { useState } from 'react';
import { useLogisticsHealth } from '@/hooks/useLogisticsHealth';
import { useTranslation } from '@/i18n';
import CardSkeleton from '@/components/ui/CardSkeleton';
import LogisticsHealthBanner from './logistics/LogisticsHealthBanner';
import BinBacklogChart from './logistics/BinBacklogChart';
import PickupSlaCard from './logistics/PickupSlaCard';
import RunnerLeaderboard from './logistics/RunnerLeaderboard';
import LogisticsEventFeed from './logistics/LogisticsEventFeed';
import LogisticsWorkspace, { type LogisticsTabId } from '@/components/views/logistics/LogisticsWorkspace';

const LogisticsView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LogisticsTabId>('requests');
  const {
    health,
    backlogSeries,
    avgPickup,
    avgCycle,
    runnerLeaderboard,
    recentEvents,
    isLoading,
  } = useLogisticsHealth();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-6xl mx-auto pb-24 animate-fade-in">
      {/* Resumen de salud */}
      {isLoading ? (
        <>
          <CardSkeleton lines={2} />
          <CardSkeleton lines={4} />
        </>
      ) : (
        <>
          <LogisticsHealthBanner health={health} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BinBacklogChart series={backlogSeries} />
            <PickupSlaCard avgPickupSec={avgPickup} avgCycleSec={avgCycle} />
            <RunnerLeaderboard runners={runnerLeaderboard} />
            <LogisticsEventFeed events={recentEvents} />
          </div>
        </>
      )}

      {/* Logística completa, aquí mismo */}
      <section aria-labelledby="logistics-ops-title" className="mt-2">
        <h2 id="logistics-ops-title" className="text-sm font-black text-text-main uppercase tracking-wider mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-base text-teal-600">local_shipping</span>
          {t('logistics.operations')}
        </h2>
        <LogisticsWorkspace activeTab={activeTab} onTabChange={setActiveTab} showTabBar />
      </section>
    </div>
  );
};

export default LogisticsView;
