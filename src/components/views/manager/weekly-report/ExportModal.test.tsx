/**
 * ExportModal — Export format/section selection modal tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportModal from './ExportModal';

describe('ExportModal', () => {
    const onClose = vi.fn();
    const onExportPDF = vi.fn();
    const onExportCSV = vi.fn();

    beforeEach(() => vi.clearAllMocks());

    it('renders Export Report heading', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        expect(screen.getByText('Export Report')).toBeTruthy();
    });

    it('renders format buttons', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        expect(screen.getByText('PDF Report')).toBeTruthy();
        expect(screen.getByText('CSV (Excel)')).toBeTruthy();
    });

    it('shows PDF sections by default', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        expect(screen.getByText('Summary KPIs')).toBeTruthy();
        expect(screen.getByText('Trend Charts')).toBeTruthy();
        expect(screen.getByText('Team Rankings')).toBeTruthy();
        expect(screen.getByText('Detailed Picker Spreadsheet')).toBeTruthy();
    });

    it('shows Generate PDF button', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        expect(screen.getByText('Generate PDF')).toBeTruthy();
    });

    it('calls onExportPDF when Generate PDF clicked', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        fireEvent.click(screen.getByText('Generate PDF'));
        expect(onExportPDF).toHaveBeenCalled();
    });

    it('passes the sections ticked in the modal to the PDF (they used to be ignored)', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        fireEvent.click(screen.getByText('Team Rankings'));
        fireEvent.click(screen.getByText('Generate PDF'));
        expect(onExportPDF).toHaveBeenLastCalledWith({ summary: true, charts: true, teams: false, pickerDetail: true });
    });

    it('switches to CSV format', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        fireEvent.click(screen.getByText('CSV (Excel)'));
        expect(screen.getByText('CSV Export')).toBeTruthy();
        expect(screen.getByText('Download CSV')).toBeTruthy();
    });

    it('calls onExportCSV when Download CSV clicked', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        fireEvent.click(screen.getByText('CSV (Excel)'));
        fireEvent.click(screen.getByText('Download CSV'));
        expect(onExportCSV).toHaveBeenCalled();
    });

    it('calls onClose when close button clicked', () => {
        render(<ExportModal onClose={onClose} onExportPDF={onExportPDF} onExportCSV={onExportCSV} />);
        fireEvent.click(screen.getByText('close'));
        expect(onClose).toHaveBeenCalled();
    });
});
