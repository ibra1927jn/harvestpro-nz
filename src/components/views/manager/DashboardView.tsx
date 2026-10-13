/**
 * components/views/manager/DashboardView.tsx
 * Executive Dashboard — KPIs with trends, smart projection, performance focus
 *
 * Sub-components: DashboardStatCard, DashboardEmptyState, VelocityChart,
 * GoalProgress, PerformanceFocus, WageShieldPanel, TeamLeadersSidebar
 */
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from '@/i18n';
import { HarvestState, Picker, BucketRecord, Tab } from '../../../types';
import { useHarvestStore } from '../../../stores/useHarvestStore';
import { analyticsService } from '../../../services/analytics.service';
import { todayNZST, dateInNZST, yesterdayNZST } from '@/utils/nzst';
import { useHarvestMetrics } from '@/hooks/useHarvestMetrics';
import VelocityChart from './VelocityChart';
import VelocityHourDrilldown from './VelocityHourDrilldown';
import WageShieldPanel from './WageShieldPanel';
import GoalProgress from './GoalProgress';
import PerformanceFocus from './PerformanceFocus';
import TeamLeadersSidebar from './TeamLeadersSidebar';
import { selectPresentPickers } from '@/services/harvestMetrics/roster';
import { SimulationBanner } from '../../SimulationBanner';
import { TrustBadges } from '../../common/TrustBadges';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import DashboardStatCard from './DashboardStatCard';
import DashboardEmptyState from './DashboardEmptyState';
import PredictionsCard from './PredictionsCard';
import { useVelocityDrilldown } from '@/hooks/useVelocityDrilldown';
import { UnclosedShiftsAlert } from '@/components/common/UnclosedShiftsAlert';
import RejectedScansAlert from '@/components/common/RejectedScansAlert';
import { formatNZD, formatNZDateTime } from '@/utils/nzFormat';

interface DashboardViewProps {
  stats: HarvestState['stats'];
  teamLeaders: Picker[];
  crew: Picker[];
  presentCount: number;
  setActiveTab: (tab: Tab) => void;
  bucketRecords?: BucketRecord[];
  onUserSelect?: (user: Partial<Picker>) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  teamLeaders,
  crew = [],
  presentCount: _presentCount = 0,
  setActiveTab,
  bucketRecords = [],
  onUserSelect,
}) => {
  const { t } = useTranslation();
  const { settings, orchard } = useHarvestStore();

  // Fuente única de verdad para KPIs (mismos datos que InsightsView)
  const {
    kpis,
    projectedEndOfDay,
    hoursElapsed: metricsHoursElapsed,
  } = useHarvestMetrics();

  const shiftStart = settings.shift_start_time ?? '07:00';
  const shiftEnd = settings.shift_end_time ?? '17:00';

  // Drill-down del gráfico de velocidad
  const velocityDrilldown = useVelocityDrilldown(bucketRecords, crew);

  // 1. Calculate Velocity (Buckets/Hr) - Last 2 Hours
  const velocity = useMemo(() => {
    if (!bucketRecords.length) return 0;
    const now = Date.now();
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    const recentCount = bucketRecords.filter(
      (r: BucketRecord) => new Date(r.created_at || r.scanned_at || '').getTime() > twoHoursAgo
    ).length;
    return Math.round(recentCount / 2);
  }, [bucketRecords]);

  // 1b. Production trend vs yesterday
  const productionTrend = useMemo(() => {
    if (!bucketRecords.length) return 0;
    const today = todayNZST();
    // yesterdayNZST() deriva del calendario NZ, no de "ahora - 24h UTC" — correcto en DST
    const yesterdayStr = yesterdayNZST();

    const todayCount = bucketRecords.filter((r: BucketRecord) => {
      return dateInNZST(r.created_at || r.scanned_at || '') === today;
    }).length;

    const yesterdayCount = bucketRecords.filter((r: BucketRecord) => {
      return dateInNZST(r.created_at || r.scanned_at || '') === yesterdayStr;
    }).length;

    if (yesterdayCount === 0) return 0;
    return Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
  }, [bucketRecords]);

  // 2. Financial Calculations — desde useHarvestMetrics (misma fuente que InsightsView)
  const alerts = useHarvestStore(state => state.alerts);
  // kpis.totalBins y kpis.totalLabour vienen del hook, calculados desde bucketRecords del store

  // Pickers trabajando ahora (fichados hoy y sin salida) — misma definición en Mapa, Runner y Team Leader
  const activeCrew = selectPresentPickers(crew).length;

  // Animated counters for stat cards (staggered delays)
  const animVelocity = useAnimatedCounter(velocity, 1000, 200);
  const animBuckets = useAnimatedCounter(kpis.totalBins, 1400, 300);
  const animCost = useAnimatedCounter(Math.round(kpis.totalLabour), 1600, 400);
  const animCrew = useAnimatedCounter(activeCrew, 800, 500);

  // 3. Progress & ETA
  const target = settings.target_tons || 40;
  const progress = Math.min(100, (stats.tons / target) * 100);

  // 4. ETA Calculation — anclada a shift_end_time para evitar jitter por wall-clock re-renders
  const shiftEndTime = settings?.shift_end_time ?? '17:00';
  const etaInfo = useMemo(() => {
    return analyticsService.calculateETA(stats.tons, target, velocity, 72, shiftEndTime);
  }, [stats.tons, target, velocity, shiftEndTime]);

  // 5. Hours elapsed — desde useHarvestMetrics (shift-anchored, no re-calc en cada render)
  const hoursElapsed = metricsHoursElapsed;

  // 6. Export Handler
  const handleExport = useCallback(() => {
    const now = new Date();
    const metadata = {
      generated_at: formatNZDateTime(now),
      last_sync: formatNZDateTime(now),
      pending_queue_count: 0,
      orchard_name: orchard?.name || 'Orchard',
      is_offline_data: !navigator.onLine,
    };

    const csv = analyticsService.generateDailyReport(
      crew,
      bucketRecords,
      { piece_rate: settings.piece_rate || 6.5, min_wage_rate: settings.min_wage_rate || 23.95 },
      teamLeaders,
      metadata
    );

    const filename = `harvest_report_${todayNZST()}.csv`;
    analyticsService.downloadCSV(csv, filename);
  }, [crew, bucketRecords, settings, teamLeaders, orchard?.name]);

  // Live clock (updates every minute)
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Estimated remaining work time (assuming 5pm NZ end)
  // Usa Intl con Pacific/Auckland para manejar NZST (UTC+12) y NZDT (UTC+13) automáticamente
  const remainingHours = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(currentTime);
    const nzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const nzMinute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const endHour = 17; // 5pm
    const remaining = endHour - nzHour - nzMinute / 60;
    return Math.max(0, remaining);
  }, [currentTime]);

  const nzTimeStr = currentTime.toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Pacific/Auckland',
    hour12: true,
  });

  // Empty state when no data at all
  const isEmpty = crew.length === 0 && bucketRecords.length === 0;

  if (isEmpty) {
    return <DashboardEmptyState setActiveTab={setActiveTab} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 animate-fade-in">
      <SimulationBanner />
      <TrustBadges />
      {orchard?.id && <UnclosedShiftsAlert orchardId={orchard.id} />}
      {orchard?.id && <RejectedScansAlert orchardId={orchard.id} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-main">{t('dashboard.title')}</h1>
          <p className="text-sm text-text-muted font-medium">
            {t('dashboard.live_monitoring')} • {orchard?.name || 'Orchard'}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
              <span aria-hidden="true" className="material-symbols-outlined text-sm">schedule</span>
              {nzTimeStr}
            </span>
            {remainingHours > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  remainingHours <= 1
                    ? 'text-amber-700 bg-amber-50'
                    : 'text-emerald-700 bg-emerald-50'
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-sm">hourglass_top</span>
                {remainingHours.toFixed(1)}h {t('dashboard.remaining')}
              </span>
            )}
            {remainingHours <= 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                <span aria-hidden="true" className="material-symbols-outlined text-sm">timer_off</span>
                {t('dashboard.overtime')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className="bg-white border border-primary/30 text-primary px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/5 hover:border-primary/50 transition-all flex items-center gap-2 shadow-sm"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">download</span>
            {t('dashboard.export')}
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className="gradient-primary glow-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-all flex items-center gap-2"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">map</span>
            {t('dashboard.live_map')}
          </button>
        </div>
      </div>

      {/* KPI Grid — Animated Executive Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard
          title={t('dashboard.velocity')}
          value={animVelocity}
          unit={t('dashboard.kpi.bins_per_hour')}
          icon="speed"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          onClick={() => setActiveTab('map')}
          staggerIndex={0}
        />
        <DashboardStatCard
          title={t('dashboard.production')}
          value={animBuckets}
          unit={t('dashboard.buckets')}
          trend={productionTrend}
          icon="inventory_2"
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          onClick={() => setActiveTab('logistics')}
          staggerIndex={1}
        />
        <DashboardStatCard
          title={t('dashboard.est_cost')}
          value={formatNZD(animCost, 0)}
          unit={t('dashboard.kpi.nzd')}
          icon="payments"
          iconBg="bg-green-50"
          iconColor="text-green-600"
          onClick={() => setActiveTab('analytics')}
          staggerIndex={2}
        />
        <DashboardStatCard
          title={t('dashboard.active_crew')}
          value={animCrew}
          unit={t('dashboard.pickers')}
          icon="groups"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          onClick={() => setActiveTab('teams')}
          staggerIndex={3}
        />
      </div>

      {/* Main Content Split */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Col */}
        <div className="lg:col-span-2 space-y-6">
          <GoalProgress
            progress={progress}
            currentTons={stats.tons}
            targetTons={target}
            eta={etaInfo.eta}
            etaStatus={etaInfo.status}
            velocity={velocity}
            totalBuckets={kpis.totalBins}
            hoursElapsed={hoursElapsed}
            projectedBuckets={projectedEndOfDay}
          />
          <ComponentErrorBoundary componentName="Velocity Chart">
            <VelocityChart
              bucketRecords={bucketRecords}
              targetVelocity={Math.round(
                ((settings.min_buckets_per_hour || 3.6) * selectPresentPickers(crew).length) / 2
              )}
              shiftStart={shiftStart}
              shiftEnd={shiftEnd}
              onBarClick={velocityDrilldown.open}
            />
          </ComponentErrorBoundary>
          <VelocityHourDrilldown
            isOpen={velocityDrilldown.isOpen}
            data={velocityDrilldown.drilldownData}
            onClose={velocityDrilldown.close}
          />
          {/* Performance Focus: Top 3 + Needs Attention */}
          <PerformanceFocus
            crew={crew}
            bucketRecords={bucketRecords}
            setActiveTab={setActiveTab}
            onUserSelect={onUserSelect}
          />
        </div>

        {/* Right Col */}
        <div className="space-y-4">
          <WageShieldPanel
            crew={crew}
            teamLeaders={teamLeaders}
            settings={{
              piece_rate: settings.piece_rate || 6.5,
              min_wage_rate: settings.min_wage_rate || 23.95,
            }}
            alerts={alerts}
            onUserSelect={onUserSelect}
          />
          <TeamLeadersSidebar
            teamLeaders={teamLeaders}
            crew={crew}
            setActiveTab={setActiveTab}
            onUserSelect={onUserSelect}
          />
          <ComponentErrorBoundary componentName="Predictions">
            <PredictionsCard setActiveTab={setActiveTab} />
          </ComponentErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
