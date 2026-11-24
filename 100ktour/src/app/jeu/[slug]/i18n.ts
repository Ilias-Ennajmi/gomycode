import type { Lang, StoreStatus } from '@/core/types';

// Les chiffres 1 · 0 · 0 sont isolés pour garder leur ordre dans un texte arabe.
const D = '⁦1 · 0 · 0⁩';

const fr = {
  langTitle: 'Choisissez votre langue',
  kicker: 'Merci pour les',
  heroSub: 'abonnés sur Instagram',
  prizeSmall: 'À gagner dans ce magasin',
  prize: "Bon d'achat de 1000 DH",
  how1: 'Inscrivez-vous',
  how2: 'Lancez la machine',
  how3: `Alignez ${D}`,
  join: 'Je participe',
  introNote: 'Une seule tentative par personne. Les gagnants sont pris en photo en magasin.',
  formTitle: 'Vos informations',
  fullName: 'Nom complet',
  age: 'Âge',
  phone: 'Numéro de téléphone',
  email: 'Email',
  optional: '(facultatif)',
  consentBefore: "J'ai {n} ans ou plus, j'accepte le ",
  consentLink: 'règlement du jeu',
  consentAfter: " et l'utilisation de mes informations par Planet Sport pour gérer ma participation.",
  optin: 'Je souhaite recevoir les offres Planet Sport par WhatsApp, SMS ou email.',
  next: 'Suivant',
  wait: 'Un instant…',
  back: 'Retour',
  machineTitle: 'À vous de jouer',
  machineHint: `Une seule tentative. Alignez ${D} et le bon de 1000 DH est à vous.`,
  spinning: 'La machine tourne…',
  start: 'Je démarre',
  startBusy: 'Ça tourne…',
  lever: 'Tirer le levier pour lancer la machine',
  winTitle: 'Félicitations',
  ticketLabel: 'Votre code gagnant',
  ticketMeta: 'À présenter chez Planet Sport {place}',
  ticketDone: 'Ce bon a déjà été remis.',
  step1: "Faites une capture d'écran de ce code.",
  step2: "Présentez-le en caisse, avec ce téléphone et une pièce d'identité.",
  step3: 'Souriez : une photo sera prise en magasin pour notre Instagram.',
  whatsapp: 'Envoyer mon code sur WhatsApp',
  waMessage: "Bonjour Planet Sport, j'ai gagné au jeu 100K à {place}. Mon code gagnant : {code}.",
  lostTitle: 'Pas cette fois',
  lostText: `La machine n'a pas aligné ${D}. Merci d'avoir joué{name}, et merci de faire partie de nos 100 000 abonnés.`,
  offersTitle: 'Nos meilleures offres vous attendent',
  offersText: 'Chaussures, vêtements et équipements des plus grandes marques.',
  offersBtn: 'Voir les offres',
  follow: 'Suivez Planet Sport',
  onePlay: 'Une seule participation par personne.',
  rules: 'Règlement du jeu',
  soundOn: 'Activer le son',
  soundOff: 'Couper le son',
  errors: {
    name: 'Indiquez votre prénom et votre nom.',
    age: 'Indiquez votre âge en chiffres.',
    age_min: 'Le jeu est réservé aux personnes de {n} ans et plus.',
    phone: 'Indiquez un numéro de mobile marocain, par exemple 06 12 34 56 78.',
    email: "Cette adresse email n'est pas valide.",
    consent: 'Cochez cette case pour participer.',
    phone_used: 'Ce numéro de téléphone a déjà participé. Une seule participation par personne.',
    rate: 'Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes.',
    unknown: 'Un problème est survenu. Vérifiez votre connexion et réessayez.',
  },
  closed: {
    sold_out: {
      title: 'Tous les bons ont été gagnés',
      text: "Les bons d'achat mis en jeu dans ce magasin ont tous trouvé leur gagnant. Merci d'avoir fêté nos 100K avec nous.",
    },
    not_started: { title: 'Le jeu ouvre bientôt', text: 'Revenez à partir du {when} pour tenter votre chance.' },
    soon: 'Revenez très vite pour tenter votre chance.',
    ended: { title: 'Le jeu est terminé', text: "Merci à toutes et à tous d'avoir fêté nos 100K avec nous." },
    paused: {
      title: 'Le jeu est en pause',
      text: "Le jeu n'est pas ouvert dans ce magasin pour le moment. Demandez à l'équipe du magasin ou réessayez un peu plus tard.",
    },
    off_hours: {
      title: 'Le jeu est fermé pour le moment',
      text: 'Le jeu est ouvert de {open} à {close}. Revenez pendant ces horaires.',
    },
    day_done: {
      title: 'Le bon du jour a été gagné',
      text: "Le bon mis en jeu aujourd'hui dans ce magasin a trouvé son gagnant. Revenez demain pour tenter votre chance.",
    },
  },
};

export type Dict = typeof fr;

const ar: Dict = {
  langTitle: 'اختر لغتك',
  kicker: 'شكراً على',
  heroSub: 'متابع على إنستغرام',
  prizeSmall: 'اربح في هذا المتجر',
  prize: 'قسيمة شراء بقيمة 1000 درهم',
  how1: 'سجّل معلوماتك',
  how2: 'شغّل الآلة',
  how3: `اجمع ${D}`,
  join: 'شارك الآن',
  introNote: 'محاولة واحدة لكل شخص. تُلتقط صورة للفائزين داخل المتجر.',
  formTitle: 'معلوماتك',
  fullName: 'الاسم الكامل',
  age: 'العمر',
  phone: 'رقم الهاتف',
  email: 'البريد الإلكتروني',
  optional: '(اختياري)',
  consentBefore: 'عمري {n} سنة أو أكثر، وأوافق على ',
  consentLink: 'قواعد اللعبة',
  consentAfter: ' وعلى استعمال معلوماتي من طرف Planet Sport لتدبير مشاركتي.',
  optin: 'أرغب في التوصل بعروض Planet Sport عبر واتساب أو الرسائل القصيرة أو البريد الإلكتروني.',
  next: 'التالي',
  wait: 'لحظة…',
  back: 'رجوع',
  machineTitle: 'دورك الآن',
  machineHint: `محاولة واحدة. اجمع ${D} واربح قسيمة 1000 درهم.`,
  spinning: 'الآلة تدور…',
  start: 'ابدأ',
  startBusy: 'جارٍ الدوران…',
  lever: 'اسحب الذراع لتشغيل الآلة',
  winTitle: 'مبروك',
  ticketLabel: 'رمز الفوز الخاص بك',
  ticketMeta: 'يُقدَّم في Planet Sport {place}',
  ticketDone: 'تم تسليم هذه القسيمة.',
  step1: 'التقط صورة للشاشة تُظهر هذا الرمز.',
  step2: 'قدّمه عند الصندوق مع هذا الهاتف وبطاقة التعريف.',
  step3: 'ابتسم: ستُلتقط لك صورة في المتجر لحسابنا على إنستغرام.',
  whatsapp: 'أرسل رمزي عبر واتساب',
  waMessage: 'مرحباً Planet Sport، ربحت في لعبة 100K في {place}. رمز الفوز: {code}.',
  lostTitle: 'ليس هذه المرة',
  lostText: `لم تجمع الآلة ${D}. شكراً على مشاركتك{name}، وشكراً لأنك من بين متابعينا المئة ألف.`,
  offersTitle: 'أفضل عروضنا في انتظارك',
  offersText: 'أحذية وملابس ومعدات رياضية من أكبر العلامات.',
  offersBtn: 'اكتشف العروض',
  follow: 'تابع Planet Sport',
  onePlay: 'مشاركة واحدة لكل شخص.',
  rules: 'قواعد اللعبة',
  soundOn: 'تشغيل الصوت',
  soundOff: 'كتم الصوت',
  errors: {
    name: 'أدخل اسمك الشخصي والعائلي.',
    age: 'أدخل عمرك بالأرقام.',
    age_min: 'اللعبة مخصصة لمن يبلغ {n} سنة فأكثر.',
    phone: 'أدخل رقم هاتف محمول مغربي، مثلاً ⁦06 12 34 56 78⁩.',
    email: 'عنوان البريد الإلكتروني غير صحيح.',
    consent: 'ضع علامة في هذه الخانة للمشاركة.',
    phone_used: 'هذا الرقم شارك من قبل. مشاركة واحدة لكل شخص.',
    rate: 'محاولات كثيرة من هذا الاتصال. حاول مجدداً بعد بضع دقائق.',
    unknown: 'حدث خطأ. تحقق من اتصالك وحاول مجدداً.',
  },
  closed: {
    sold_out: {
      title: 'تم ربح جميع القسائم',
      text: 'جميع قسائم الشراء المخصصة لهذا المتجر وجدت فائزيها. شكراً لاحتفالكم معنا بـ 100K.',
    },
    not_started: { title: 'اللعبة ستبدأ قريباً', text: 'عد ابتداءً من {when} لتجرب حظك.' },
    soon: 'عد قريباً لتجرب حظك.',
    ended: { title: 'انتهت اللعبة', text: 'شكراً لكم جميعاً على الاحتفال معنا بـ 100K.' },
    paused: {
      title: 'اللعبة متوقفة مؤقتاً',
      text: 'اللعبة غير متاحة حالياً في هذا المتجر. اسأل فريق المتجر أو حاول لاحقاً.',
    },
    off_hours: {
      title: 'اللعبة مغلقة حالياً',
      text: 'اللعبة متاحة من ⁦{open}⁩ إلى ⁦{close}⁩. عد خلال هذه الأوقات.',
    },
    day_done: {
      title: 'تم ربح قسيمة اليوم',
      text: 'قسيمة اليوم في هذا المتجر وجدت فائزها. عد غداً لتجرب حظك.',
    },
  },
};

export const DICTS: Record<Lang, Dict> = { fr, ar };

export function fill(text: string, vars: Record<string, string | number | null>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function closedCopy(
  t: Dict,
  lang: Lang,
  status: StoreStatus,
  v: { city: string; startsAt: string | null; open: string | null; close: string | null },
): { title: string; text: string } {
  const c = t.closed;
  switch (status) {
    case 'sold_out':
      return { title: c.sold_out.title, text: fill(c.sold_out.text, v) };
    case 'not_started': {
      if (!v.startsAt) return { title: c.not_started.title, text: c.soon };
      const when = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Africa/Casablanca',
      }).format(new Date(v.startsAt));
      return { title: c.not_started.title, text: fill(c.not_started.text, { when }) };
    }
    case 'ended':
      return c.ended;
    case 'off_hours':
      return { title: c.off_hours.title, text: fill(c.off_hours.text, { open: v.open ?? '', close: v.close ?? '' }) };
    case 'day_done':
      return { title: c.day_done.title, text: fill(c.day_done.text, v) };
    default:
      return { title: c.paused.title, text: fill(c.paused.text, v) };
  }
}
