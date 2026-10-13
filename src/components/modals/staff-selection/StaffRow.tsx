/**
 * Fila de la lista de personal (marcado movido sin cambios desde TeamLeaderSelectionModal).
 */
import React from 'react';
import { initials, roleColor, roleIcon, roleLabel, type StaffInfo } from './staffSelectionLogic';

interface StaffRowProps {
    person: StaffInfo;
    alreadyHere: boolean;
    isSelected: boolean;
    isUnlinking: boolean;
    isConfirming: boolean;
    onToggle: (id: string) => void;
    onUnlink: (e: React.MouseEvent, id: string) => void;
}

export const StaffRow: React.FC<StaffRowProps> = ({
    person, alreadyHere, isSelected, isUnlinking, isConfirming, onToggle, onUnlink,
}) => (
        <div
                        onClick={() => !alreadyHere && !isUnlinking && onToggle(person.id)}
            className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-200 ${alreadyHere
                ? 'border-green-200 bg-green-50/30 cursor-default'
                : isSelected
                    ? 'border-indigo-400 bg-indigo-50 shadow-sm cursor-pointer'
                    : 'border-border-light cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-200 hover:shadow-sm'
                } group`}
        >
            <div className="flex items-center gap-3">
                {/* Checkbox */}
                <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${alreadyHere
                    ? 'border-green-400 bg-green-100'
                    : isSelected
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-slate-300 group-hover:border-indigo-400'
                    }`}>
                    {(isSelected || alreadyHere) && (
                        <span aria-hidden="true" className={`material-symbols-outlined text-xs ${alreadyHere ? 'text-green-600' : 'text-white'}`}>check</span>
                    )}
                </div>

                <div className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                    {initials(person.full_name)}
                </div>
                <div>
                    <p className="font-bold text-text-main">{person.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleColor(person.role)}`}>
                            <span aria-hidden="true" className="material-symbols-outlined text-[10px] mr-0.5 align-middle">{roleIcon(person.role)}</span>
                            {roleLabel(person.role)}
                        </span>
                        {alreadyHere && (
                            <span className="text-[10px] text-green-600 font-bold">✅ Linked</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Right side: unlink button for linked, check for selected */}
            {alreadyHere ? (
                <button
                    onClick={(e) => onUnlink(e, person.id)}
                    disabled={isUnlinking}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all duration-200 ${isUnlinking
                        ? 'bg-slate-100 text-slate-400 cursor-wait'
                        : isConfirming
                            ? 'bg-red-500 text-white shadow-sm hover:bg-red-600'
                            : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                        }`}
                >
                    {isUnlinking ? (
                        <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    ) : isConfirming ? (
                        <>
                            <span aria-hidden="true" className="material-symbols-outlined text-xs">warning</span>
                            Confirm?
                        </>
                    ) : (
                        <>
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">link_off</span>
                            Unlink
                        </>
                    )}
                </button>
            ) : isSelected ? (
                <span aria-hidden="true" className="material-symbols-outlined text-indigo-600">check_circle</span>
            ) : null}
        </div>
);
