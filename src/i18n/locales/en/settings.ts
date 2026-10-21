import type { TranslationDict } from '../../types';

const settings: TranslationDict = {
    'settings.title': 'Settings',
    'settings.header': 'Settings',
    'settings.subtitle': '{orchard} configuration',
    'settings.language': 'Language',
    'settings.language_desc': 'Choose your preferred language',
    'settings.language.active': 'Active',
    'settings.notifications': 'Notifications',
    'settings.profile': 'Profile',
    'settings.security': 'Security',
    'settings.about': 'About',
    // Banner
    'settings.banner.role': 'Manager',
    'settings.banner.orchard_line': '{role} · {orchard}',
    'settings.banner.rows': 'ROWS',
    'settings.banner.rate': 'RATE',
    'settings.banner.target': 'TARGET',
    // Harvest Configuration
    'settings.harvest.title': 'Harvest Configuration',
    'settings.harvest.subtitle': 'Rates, targets & shift hours',
    'settings.harvest.piece_rate': 'Piece Rate (per bucket)',
    'settings.harvest.min_wage': 'Minimum Wage (per hour)',
    'settings.harvest.target_buckets': 'Target Buckets / Hour',
    'settings.harvest.daily_target': 'Daily Target (tons)',
    'settings.harvest.shift_hours': 'SHIFT HOURS',
    'settings.harvest.shift_start': 'Shift Start',
    'settings.harvest.min_warning': 'Minimum to meet ${wage}/hr at ${rate}/bucket = {floor} b/hr',
    // Orchard Details
    'settings.orchard.title': 'Orchard Details',
    'settings.orchard.subtitle': 'Farm information',
    'settings.orchard.label': 'Orchard',
    'settings.orchard.total_rows': 'Total Rows',
    'settings.orchard.varieties': 'Fruit Varieties',
    // Compliance
    'settings.compliance.title': 'Compliance Settings',
    'settings.compliance.subtitle': 'NZ labour regulations',
    'settings.compliance.nz_standards': 'NZ Employment Standards',
    'settings.compliance.nz_standards_desc': 'Enforce minimum wage and break requirements',
    'settings.compliance.wage_alerts': 'Automatic Wage Alerts',
    'settings.compliance.wage_alerts_desc': 'Notify when workers fall below minimum wage',
    'settings.compliance.safety': 'Safety Verification Required',
    'settings.compliance.safety_desc': 'Require daily safety check before scanning',
    'settings.compliance.audit_trail': 'Audit Trail Logging',
    'settings.compliance.audit_trail_desc': 'All actions are logged — cannot be disabled',
    'settings.compliance.always_on': 'Always On',
    // Danger Zone
    'settings.danger.title': 'Danger Zone',
    'settings.danger.subtitle': 'Irreversible actions',
    'settings.danger.day_closure': 'Day Closure',
    'settings.danger.day_closure_desc': 'Finalize payroll, lock records, and close the harvest day',
    'settings.danger.end_day': 'End & Lock Day',
    'settings.danger.reset_title': "Reset Today's Data",
    'settings.danger.reset_desc': 'Clear all bucket records for today',
    'settings.danger.reset_btn': 'Reset',
    // Misc
    'settings.saved_banner': 'All Changes Saved',
    'settings.footer': 'HarvestPro NZ · v9.9.0 · © 2026 HarvestPro. Built for NZ Orchards.',
    'settings.locked_by_hr': 'Only HR can modify this value',
    'settings.harvest.shift_end_by_person': 'There is no shift end time: each team and runner finishes when they clock out.',
};

export default settings;
