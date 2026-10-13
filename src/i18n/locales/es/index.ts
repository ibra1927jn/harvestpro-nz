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

// Claves propias de este idioma (sin heredar de otro: el checker exige todas)
const es: TranslationDict = {
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
};

export default es;
