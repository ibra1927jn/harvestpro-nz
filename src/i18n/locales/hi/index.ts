import type { TranslationDict } from '../../types';
import nav from './nav';
import dashboard from './dashboard';
import settings from './settings';
import teams from './teams';
import insights from './insights';
import panel from './panel';
import common from './common';
import auth from './auth';
import fraud from './fraud';
import scanner from './scanner';
import misc from './misc';
import orchardMap from './orchardMap';
import assignModal from './assignModal';
import logistics from './logistics';
import legal from './legal';
import pickerDetails from './pickerDetails';
import qc from './qc';
import runner from './runner';
import shared from './shared';
import teamLeader from './teamLeader';

// Claves propias de este idioma (sin heredar de otro: el checker exige todas)
const hi: TranslationDict = {
    ...nav,
    ...dashboard,
    ...settings,
    ...teams,
    ...insights,
    ...panel,
    ...common,
    ...auth,
    ...fraud,
    ...scanner,
    ...misc,
    ...orchardMap,
    ...assignModal,
    ...logistics,
    ...legal,
    ...pickerDetails,
    ...qc,
    ...runner,
    ...shared,
    ...teamLeader,
};

export default hi;
