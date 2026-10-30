/**
 * QualityTab — grades A/B/C/reject + overall score.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import QualityTab from './QualityTab';
import { I18nProvider } from '@/i18n';

function renderWithI18n(ui: React.ReactElement) {
    return render(<I18nProvider>{ui}</I18nProvider>);
}

const baseQuality = {
    gradeA: 10,
    gradeB: 5,
    gradeC: 3,
    reject: 2,
    total: 20,
    score: 75,
    flaggedCriteria: [],
};

describe('QualityTab', () => {
    it('renderiza counts A/B/C/reject', () => {
        const { getByText } = renderWithI18n(<QualityTab quality={baseQuality} />);
        expect(getByText('10')).toBeInTheDocument();
        expect(getByText('5')).toBeInTheDocument();
        expect(getByText('3')).toBeInTheDocument();
        expect(getByText('2')).toBeInTheDocument();
    });

    it('renderiza overall score', () => {
        const { getByText } = renderWithI18n(<QualityTab quality={baseQuality} />);
        expect(getByText('75/100')).toBeInTheDocument();
    });

    it('quality.total 0 muestra empty state icon search_off', () => {
        const { getByText } = renderWithI18n(
            <QualityTab quality={{ gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, total: 0, score: 0, flaggedCriteria: [] }} />,
        );
        expect(getByText('search_off')).toBeInTheDocument();
    });

    it('total > 0 NO muestra empty state', () => {
        const { queryByText } = renderWithI18n(<QualityTab quality={baseQuality} />);
        expect(queryByText('search_off')).toBeNull();
    });

    it('score 0 renderizado sin crash', () => {
        const { getByText } = renderWithI18n(
            <QualityTab quality={{ gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, total: 0, score: 0, flaggedCriteria: [] }} />,
        );
        expect(getByText('0/100')).toBeInTheDocument();
    });

    it('usa las etiquetas de la inspección del picker (Bien / Aceptable / A corregir / Grave)', () => {
        const { getByText, queryByText } = renderWithI18n(<QualityTab quality={baseQuality} />);
        expect(getByText('Good')).toBeInTheDocument();
        expect(getByText('Acceptable')).toBeInTheDocument();
        expect(getByText('Needs correcting')).toBeInTheDocument();
        expect(getByText('Severe')).toBeInTheDocument();
        expect(queryByText('Grade A')).toBeNull();
    });

    it('enseña los criterios con aviso en rojo (mal) o ámbar (regular)', () => {
        const { getByTestId, getByText } = renderWithI18n(
            <QualityTab
                quality={{
                    ...baseQuality,
                    flaggedCriteria: [
                        { key: 'ladder', warn: 0, bad: 2, total: 2 },
                        { key: 'size', warn: 1, bad: 0, total: 1 },
                    ],
                }}
            />,
        );
        const box = getByTestId('flagged-criteria');
        expect(box).toBeInTheDocument();
        expect(getByText('Ladder use').closest('li')?.className).toContain('bg-red-100');
        expect(getByText('Size').closest('li')?.className).toContain('bg-amber-100');
        expect(getByText('2 bad · 0 so-so')).toBeInTheDocument();
    });

    it('sin criterios (inspecciones antiguas o flaggedCriteria ausente) no enseña la sección', () => {
        const { queryByTestId } = renderWithI18n(
            <QualityTab quality={{ ...baseQuality, flaggedCriteria: undefined as never }} />,
        );
        expect(queryByTestId('flagged-criteria')).toBeNull();
    });
});
