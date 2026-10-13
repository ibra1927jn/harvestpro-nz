import type { TranslationDict } from '../../types';

const legal: TranslationDict = {
    'error.title': 'Algo salió mal',
    'error.description': 'La aplicación encontró un error inesperado.',
    'error.reload': 'Recargar Aplicación',
    'error.clearCache': 'Limpiar Caché y Recargar',
    'privacy.title': 'Aviso de Privacidad y Recopilación de Datos',
    'privacy.subtitle': 'Según la Ley de Privacidad de Nueva Zelanda 2020, estamos obligados a informarle sobre cómo se recopila, utiliza y protege su información personal antes de utilizar este sistema. Por favor, lea lo siguiente detenidamente.',
    'privacy.section1.title': '1. Información que Recopilamos (IPP 1–3)',
    'privacy.section1.body': 'HarvestPro NZ recopila la siguiente información personal:\n• Nombre completo, correo electrónico y datos de contacto\n• Información laboral: rol, tipo de contrato, estado de visa, número IRD\n• Datos de rendimiento: conteo de cubetas/bins, marcas de tiempo de escaneo, asignaciones de hileras\n• Registros de asistencia: hora de entrada/salida, cumplimiento de descansos, horas trabajadas\n• Identificadores de dispositivo para sincronización offline\n• Datos de ubicación al usar el mapa de zonas del huerto (opcional)\n\nEsta información se recopila directamente de usted y de su empleador (el operador del huerto) para los fines descritos a continuación.',
    'privacy.section2.title': '2. Finalidad de la Recopilación (IPP 1)',
    'privacy.section2.body': 'Su información personal se recopila y utiliza para:\n• Cálculo preciso de salarios, tarifas por pieza y complementos de salario mínimo según la Ley de Relaciones Laborales 2000\n• Supervisión del cumplimiento de los requisitos legales de descanso y alimentación\n• Generación de informes de nómina para exportación a sistemas autorizados (Xero, PaySauce)\n• Seguimiento de la productividad de cosecha y operaciones del huerto\n• Garantizar el cumplimiento de la seguridad y salud laboral\n• Producción de registros de auditoría requeridos por la normativa laboral de NZ',
    'privacy.section3.title': '3. Almacenamiento y Seguridad (IPP 5)',
    'privacy.section3.body': 'Sus datos se almacenan en:\n• Servidores en la nube operados por Supabase (PostgreSQL) con Seguridad a Nivel de Fila — solo puede acceder a datos de su huerto asignado\n• Almacenamiento local del dispositivo (IndexedDB encriptado con AES-256) para capacidad offline\n• Todas las transmisiones de datos utilizan encriptación TLS 1.3\n• El acceso está controlado por permisos basados en roles y autenticación multifactor para gerentes\n• Los datos financieros y personales están encriptados en reposo en su dispositivo',
    'privacy.section4.title': '4. Quién Tiene Acceso (IPP 11)',
    'privacy.section4.body': 'Su información personal puede ser accedida por:\n• Su gerente de huerto designado y administrador de nómina\n• Jefes de equipo (limitado a datos de asistencia y asignación de su cuadrilla)\n• El operador del huerto para cumplimiento legal y regulatorio\n• Agencias gubernamentales solo cuando lo exija la ley (ej: Employment NZ, IRD)\n\nSus datos NO serán vendidos, compartidos con anunciantes ni divulgados a terceros no listados arriba sin su consentimiento explícito o un requerimiento legal.',
    'privacy.section5.title': '5. Sus Derechos (IPP 6–7)',
    'privacy.section5.body': 'Según la Ley de Privacidad de NZ 2020, usted tiene derecho a:\n• Solicitar acceso a toda la información personal que se tiene sobre usted\n• Solicitar la corrección de cualquier información inexacta\n• Preguntar cómo se ha utilizado o divulgado su información\n• Retirarse de la recopilación de datos no esenciales (ej: seguimiento de ubicación)\n• Presentar una queja ante el Comisionado de Privacidad de NZ (privacy.org.nz)\n\nPara ejercer estos derechos, contacte a su gerente de huerto o al administrador del sistema.',
    'privacy.section6.title': '6. Retención de Datos',
    'privacy.section6.body': 'Los registros laborales se conservan durante un mínimo de 6 años según lo requiere la Ley de Relaciones Laborales 2000 y la Ley de Feriados 2003. Después de este período, los registros pueden ser eliminados o anonimizados de forma segura.\n\nCuando termine su empleo, su cuenta activa será desactivada pero los registros se conservarán durante el período legal.',
    'privacy.legalRef': 'Este aviso se emite de conformidad con la Ley de Privacidad de Nueva Zelanda 2020 (Principios de Privacidad de la Información 1–6), la Ley de Relaciones Laborales 2000 y la Ley de Feriados 2003. Para consultas, contacte a la Oficina del Comisionado de Privacidad de NZ en privacy.org.nz.',
    'privacy.acceptButton': 'He Leído y Acepto Este Aviso de Privacidad',
    'privacy.submitting': 'Registrando consentimiento...',
    'privacy.scrollToRead': 'Desplácese hacia abajo para leer el aviso completo',
    'privacy.footer': 'Su consentimiento será registrado con una marca de tiempo. Puede solicitar una copia de este aviso en cualquier momento.',
    'privacy.error': 'Error al registrar el consentimiento. Intente de nuevo o contacte a su gerente.',
};

export default legal;
