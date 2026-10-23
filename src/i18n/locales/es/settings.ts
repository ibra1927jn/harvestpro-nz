import type { TranslationDict } from '../../types';

const settings: TranslationDict = {
    'settings.title': 'Ajustes',
    'settings.header': 'Ajustes',
    'settings.subtitle': 'Configuración de {orchard}',
    'settings.language': 'Idioma',
    'settings.language_desc': 'Elige tu idioma preferido',
    'settings.language.active': 'Activo',
    'settings.notifications': 'Notificaciones',
    'settings.security': 'Seguridad',
    // Banner
    'settings.banner.role': 'Gerente',
    'settings.banner.orchard_line': '{role} · {orchard}',
    'settings.banner.rows': 'FILAS',
    'settings.banner.rate': 'TARIFA',
    'settings.banner.target': 'META',
    // Harvest Configuration
    'settings.harvest.title': 'Configuración de Cosecha',
    'settings.harvest.subtitle': 'Tarifas, metas y horarios de turno',
    'settings.harvest.min_wage': 'Salario Mínimo (por hora)',
    'settings.harvest.target_buckets': 'Meta de Cubetas / Hora',
    'settings.harvest.daily_target': 'Meta Diaria (toneladas)',
    'settings.harvest.shift_hours': 'HORARIO DE TURNO',
    'settings.harvest.shift_start': 'Inicio de Turno',
    'settings.harvest.min_warning': 'Mínimo para alcanzar ${wage}/hr a ${rate}/cubeta = {floor} c/hr',
    // Orchard Details
    'settings.orchard.title': 'Detalles del Huerto',
    'settings.orchard.subtitle': 'Información de la finca',
    'settings.orchard.label': 'Huerto',
    'settings.orchard.total_rows': 'Filas Totales',
    'settings.orchard.varieties': 'Variedades de Fruta',
    // Compliance
    'settings.compliance.title': 'Ajustes de Cumplimiento',
    'settings.compliance.subtitle': 'Regulaciones laborales de NZ',
    'settings.compliance.audit_trail': 'Registro de Auditoría',
    'settings.compliance.audit_trail_desc': 'Todas las acciones son registradas — no se puede deshabilitar',
    'settings.compliance.always_on': 'Siempre Activo',
    // Danger Zone
    'settings.danger.title': 'Zona de Peligro',
    'settings.danger.subtitle': 'Acciones irreversibles',
    'settings.danger.day_closure': 'Cierre de Día',
    'settings.danger.day_closure_desc': 'Finalizar nómina, bloquear registros y cerrar el día de cosecha',
    // Misc
    'settings.saved_banner': 'Todos los Cambios Guardados',
    'settings.locked_by_hr': 'Solo RRHH puede modificar este valor',
    'settings.harvest.shift_end_by_person': 'No hay hora de fin de turno: cada equipo y cada runner terminan cuando fichan su salida.',
};

export default settings;
