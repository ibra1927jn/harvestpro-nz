/**
 * Messaging helpers, constants, and shared types
 */
import { MessagePriority } from '../../../types';
import { translate, type TFunction } from '@/i18n';
import { dateInNZST, todayNZST, yesterdayNZST } from '@/utils/nzst';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';

// ── Quick Reply presets for field context ──
// label = clave de traducción (la respuesta se envía en el idioma de quien la toca)
export const QUICK_REPLIES = [
    { emoji: '👍', label: 'chat.qr.acknowledged' },
    { emoji: '✅', label: 'chat.qr.done' },
    { emoji: '🚜', label: 'chat.qr.on_my_way' },
    { emoji: '⚠️', label: 'chat.qr.issue_here' },
    { emoji: '☔', label: 'chat.qr.weather_stop' },
    { emoji: '🔄', label: 'chat.qr.need_backup' },
];

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ── Avatar colors by name hash ──
const AVATAR_COLORS = [
    'from-violet-500 to-purple-600', 'from-blue-500 to-indigo-600', 'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600', 'from-rose-500 to-pink-600', 'from-cyan-500 to-sky-600',
    'from-fuchsia-500 to-purple-600', 'from-lime-500 to-green-600',
];
export const getAvatarColor = (name: string) => AVATAR_COLORS[Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length];

// ── Date formatting helpers ──
export const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

// Día de NZ (no el del móvil): un mensaje de las 23:30 NZ es de "hoy" aunque el móvil esté en otra zona
export const getDateLabel = (dateStr: string, t: TFunction = translate) => {
    const day = dateInNZST(dateStr);
    if (day === todayNZST()) return t('common.today');
    if (day === yesterdayNZST()) return t('common.yesterday');
    return formatNZDate(dateStr, 'weekdayShort');
};

/** Hora del mensaje en hora de NZ, 24 h */
export const formatTime = (dateStr: string) => formatNZTime(dateStr);

// ── Role badge helper (for NewChatModal) ──
export const getRoleBadge = (role: string) => {
    switch (role.toLowerCase()) {
        case 'manager': return { bg: 'bg-purple-100 text-purple-600', icon: 'admin_panel_settings' };
        case 'team_leader': return { bg: 'bg-blue-100 text-blue-600', icon: 'supervisor_account' };
        case 'runner': return { bg: 'bg-amber-100 text-amber-600', icon: 'directions_run' };
        default: return { bg: 'bg-emerald-100 text-emerald-600', icon: 'agriculture' };
    }
};

// ── Shared types for sub-components ──
export interface DBMessageCompat {
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    conversation_id?: string;
    priority: MessagePriority;
    read_by: string[];
    metadata?: { replyTo?: string };
}
