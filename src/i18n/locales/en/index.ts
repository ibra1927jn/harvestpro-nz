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
import admin from './admin';
import chat from './chat';
import hr from './hr';
import legal from './legal';
import login from './login';
import logistics2 from './logistics2';
import manager from './manager';
import manager2 from './manager2';
import payroll from './payroll';
import pickerDetails from './pickerDetails';
import qc from './qc';
import runner from './runner';
import shared from './shared';
import status from './status';
import sync from './sync';
import teamLeader from './teamLeader';

// Claves propias de este idioma (sin heredar de otro: el checker exige todas)
const en: TranslationDict = {
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
    ...admin,
    ...chat,
    ...hr,
    ...legal,
    ...login,
    ...logistics2,
    ...manager,
    ...manager2,
    ...payroll,
    ...pickerDetails,
    ...qc,
    ...runner,
    ...shared,
    ...status,
    ...sync,
    ...teamLeader,
};

export default en;
