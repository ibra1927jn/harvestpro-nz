import type { TranslationDict } from '../../types';

const assignModal: TranslationDict = {
    'assignModal.title': 'Rang {row}',
    'assignModal.subtitle': '{occupiedCount}/{totalRows} rangs attribués',
    'assignModal.team_leader': 'Chef d’équipe',
    'assignModal.bucket_runner': 'Runner de seaux',
    'assignModal.side': 'Côté',
    'assignModal.side.north': 'Nord',
    'assignModal.side.south': 'Sud',
    'assignModal.select_leader': 'Choisir un chef d’équipe…',
    'assignModal.select_runner': 'Choisir un runner (facultatif)…',
    'assignModal.confirm': 'Confirmer l’attribution',
    'assignModal.confirm_n_rows': 'Attribuer {n} rangs',
    'assignModal.assigning': 'Attribution…',
    'assignModal.people_on_row_one': '{n} personne sur le rang',
    'assignModal.people_on_row_other': '{n} personnes sur le rang',
    'assignModal.teams_on_row': '{n} équipe sur le rang {row}',
    'assignModal.teams_on_row_plural': '{n} équipes sur le rang {row}',
    // Row selection grid
    'assignModal.selected_one': '{n} rang sélectionné',
    'assignModal.selected_other': '{n} rangs sélectionnés',
    'assignModal.block_rows': '{blockName} — Rangs',
};

export default assignModal;
