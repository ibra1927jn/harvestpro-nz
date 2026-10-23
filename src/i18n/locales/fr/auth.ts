import type { TranslationDict } from '../../types';

const auth: TranslationDict = {
    'auth.welcome': 'Bon retour !',
    'auth.sign_in': 'Se connecter',
    'auth.sign_in_desc': 'Connectez-vous pour accéder à votre tableau de bord',
    'auth.register': 'S’inscrire',
    'auth.email': 'E-mail',
    'auth.password': 'Mot de passe',
    'auth.forgot_password': 'Mot de passe oublié ?',
    // 2FA / MFA
    'auth.twoFactor.title': 'Authentification à deux facteurs',
    'auth.twoFactor.subtitle': 'Saisissez le code à 6 chiffres de votre application d’authentification',
    'auth.twoFactor.verify': 'Vérifier',
    'auth.twoFactor.verifying': 'Vérification…',
    'auth.twoFactor.cancel': 'Annuler',
    'auth.twoFactor.back': '← Retour à la connexion',
    'auth.twoFactor.resend': 'Renvoyer le code',
    'auth.twoFactor.resend_in': 'Renvoyer dans {n} s',
    'auth.twoFactor.expires_in': 'Le code expire dans {mm}:{ss}',
    'auth.twoFactor.lost_access': 'Vous n’avez plus accès à votre application d’authentification ?',
    'auth.twoFactor.contact_admin': 'Contactez votre administrateur pour obtenir de l’aide.',
    'auth.twoFactor.error_length': 'Saisissez un code à 6 chiffres',
    'auth.twoFactor.error_invalid': 'Code invalide. Réessayez.',
    // Claves adicionales para LoginForm, RegisterForm y Login
    'auth.signing_in': 'Connexion…',
    'auth.sign_up': 'S’inscrire',
    'auth.full_name': 'Nom complet',
    'auth.or_register': 'Nouveau ? Créez un compte',
    'auth.or_login': 'Vous avez déjà un compte ? Connectez-vous',
    'auth.create_account': 'Créer un compte',
    'auth.creating_account': 'Création du compte…',
    'auth.welcome_back': 'Bon retour !',
    'auth.sign_in_desc_alt': 'Connectez-vous pour accéder à votre tableau de bord',
    'auth.register_desc': 'Créez votre compte',
    'auth.register_hr_notice': 'Inscrivez-vous avec l’e-mail autorisé par les RH',
    'auth.register_hr_notice_full': 'Inscrivez-vous avec l’e-mail autorisé par les RH. Votre rôle et votre service sont attribués automatiquement.',
};

export default auth;
