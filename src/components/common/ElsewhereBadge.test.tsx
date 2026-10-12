import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ElsewhereBadge } from './ElsewhereBadge';

describe('ElsewhereBadge', () => {
    it('muestra el huerto donde trabaja ahora', () => {
        render(<ElsewhereBadge person={{ elsewhere: { orchard_id: 'b', orchard_name: 'Orchard B' } }} />);
        expect(screen.getByText('Now at Orchard B')).toBeInTheDocument();
    });
    it('no muestra nada si no está en otro huerto', () => {
        const { container } = render(<ElsewhereBadge person={{ elsewhere: null }} />);
        expect(container).toBeEmptyDOMElement();
    });
});
