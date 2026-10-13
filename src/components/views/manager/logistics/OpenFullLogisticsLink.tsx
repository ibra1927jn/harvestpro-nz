/**
 * OpenFullLogisticsLink — Enlace para abrir la vista completa del dpto. de logística.
 * Navega a /logistics-dept (ruta protegida con rol manager).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n';

interface OpenFullLogisticsLinkProps {
  className?: string;
}

const OpenFullLogisticsLink: React.FC<OpenFullLogisticsLinkProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/logistics-dept');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-1 py-2 underline-offset-2 hover:underline ${className}`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-base">open_in_new</span>
      {t('logistics.full_view')}
    </button>
  );
};

export default OpenFullLogisticsLink;
