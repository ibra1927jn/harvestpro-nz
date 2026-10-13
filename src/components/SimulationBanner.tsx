import { useHarvestStore } from '@/stores/useHarvestStore';
import { useTranslation } from '@/i18n';


/**
 * SimulationBanner
 * Displayed at the top of Dashboard when drill simulator is active
 * Prevents managers from mistaking test alerts for real incidents
 */
export function SimulationBanner() {
    const { t } = useTranslation();
    const simulationMode = useHarvestStore((state) => state.simulationMode);

    if (!simulationMode) return null;

    return (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 shadow-lg border-b-2 border-amber-600">
            <div className="flex items-center justify-center gap-3 text-white">
                <span aria-hidden="true" className="material-symbols-outlined text-2xl animate-pulse">warning</span>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                    <span className="text-lg font-bold">🧪 {t('sim.active')}</span>
                    <span className="text-sm opacity-90">{t('sim.desc')}</span>
                </div>
                <span aria-hidden="true" className="material-symbols-outlined text-2xl animate-pulse">warning</span>
            </div>
        </div>
    );
}
