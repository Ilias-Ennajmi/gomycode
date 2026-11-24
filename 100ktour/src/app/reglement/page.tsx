import { rpc } from '@/core/db';
import type { GameState } from '@/core/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Règlement du jeu | Planet Sport 100K Tour' };

function French({ minAge }: { minAge: number }) {
  return (
    <main className="doc" lang="fr">
      <img src="/brand/planet-sport-black.png" alt="Planet Sport" width={785} height={118} />
      <a className="doc-lang" href="/reglement?lang=ar" lang="ar">
        العربية
      </a>
      <h1>Règlement du jeu 100K Tour</h1>
      <p>
        Planet Sport organise ce jeu pour fêter ses 100 000 abonnés sur Instagram. La participation est gratuite
        et sans obligation d&apos;achat. Participer au jeu vaut acceptation pleine et entière du présent règlement.
      </p>

      <h2>Qui peut jouer</h2>
      <ul>
        <li>Toute personne âgée de {minAge} ans ou plus, résidant au Maroc.</li>
        <li>Une seule participation par personne, par numéro de téléphone et par appareil.</li>
        <li>Le personnel de Planet Sport et ses proches ne peuvent pas participer.</li>
      </ul>

      <h2>Comment jouer</h2>
      <ul>
        <li>Scannez le QR code affiché en magasin et remplissez le formulaire.</li>
        <li>Lancez la machine. Si elle aligne 1, 0, 0, vous gagnez.</li>
        <li>Le résultat est déterminé par un tirage au sort électronique au moment où vous lancez la machine.</li>
        <li>Le jeu peut être ouvert à certaines heures seulement, selon les magasins.</li>
      </ul>

      <h2>Les lots</h2>
      <ul>
        <li>Chaque gagnant reçoit un bon d&apos;achat de 1000 DH à dépenser chez Planet Sport.</li>
        <li>Le nombre de bons est limité dans chaque magasin et pour chaque journée.</li>
        <li>Le bon est personnel. Il ne peut être ni échangé contre de l&apos;argent, ni cédé, ni remplacé.</li>
      </ul>

      <h2>Recevoir son bon</h2>
      <ul>
        <li>Présentez votre code gagnant en caisse, dans le magasin où vous avez joué.</li>
        <li>Munissez-vous du téléphone utilisé pour jouer et d&apos;une pièce d&apos;identité.</li>
        <li>
          Le gagnant accepte d&apos;être pris en photo en magasin et autorise Planet Sport à publier cette photo
          et son prénom sur ses réseaux sociaux, sans contrepartie.
        </li>
      </ul>

      <h2>Vos données personnelles</h2>
      <p>
        Les informations recueillies (nom, âge, numéro de téléphone et, si vous la donnez, adresse email) sont
        traitées par Planet Sport pour gérer votre participation, empêcher les participations multiples et
        remettre les lots. Elles ne servent à vous envoyer des offres que si vous avez coché la case prévue à cet
        effet. Ce traitement est réalisé conformément à la loi n° 09-08 relative à la protection des personnes
        physiques à l&apos;égard du traitement des données à caractère personnel. Vous disposez d&apos;un droit
        d&apos;accès, de rectification et d&apos;opposition, que vous pouvez exercer en vous adressant à Planet
        Sport.
      </p>

      <h2>Fraude et responsabilité</h2>
      <p>
        Toute fausse information ou tentative de contourner la limite d&apos;une participation par personne
        entraîne l&apos;annulation de la participation et du lot. Planet Sport peut modifier, suspendre ou
        arrêter le jeu à tout moment si les circonstances l&apos;exigent, sans que sa responsabilité puisse être
        engagée. Planet Sport ne peut être tenu responsable d&apos;un problème de connexion ou d&apos;un
        dysfonctionnement technique indépendant de sa volonté.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Le présent règlement est soumis au droit marocain. Tout litige qui ne pourrait être réglé à l&apos;amiable
        relève des tribunaux compétents de Casablanca.
      </p>
    </main>
  );
}

function Arabic({ minAge }: { minAge: number }) {
  return (
    <main className="doc" lang="ar" dir="rtl">
      <img src="/brand/planet-sport-black.png" alt="Planet Sport" width={785} height={118} />
      <a className="doc-lang" href="/reglement?lang=fr" lang="fr" dir="ltr">
        Français
      </a>
      <h1>قواعد لعبة 100K Tour</h1>
      <p>
        تنظم Planet Sport هذه اللعبة احتفالاً ببلوغ 100 ألف متابع على إنستغرام. المشاركة مجانية ودون أي التزام
        بالشراء. المشاركة في اللعبة تعني القبول التام بهذه القواعد.
      </p>

      <h2>من يمكنه المشاركة</h2>
      <ul>
        <li>كل شخص يبلغ {minAge} سنة أو أكثر ويقيم بالمغرب.</li>
        <li>مشاركة واحدة لكل شخص، ولكل رقم هاتف، ولكل جهاز.</li>
        <li>لا يحق لمستخدمي Planet Sport وأقاربهم المشاركة.</li>
      </ul>

      <h2>طريقة اللعب</h2>
      <ul>
        <li>امسح رمز QR المعروض في المتجر واملأ الاستمارة.</li>
        <li>
          شغّل الآلة. إذا اجتمعت الأرقام <bdi dir="ltr">1 · 0 · 0</bdi> فأنت فائز.
        </li>
        <li>تُحدَّد النتيجة بقرعة إلكترونية لحظة تشغيل الآلة.</li>
        <li>قد تكون اللعبة متاحة في أوقات محددة فقط حسب المتاجر.</li>
      </ul>

      <h2>الجوائز</h2>
      <ul>
        <li>يحصل كل فائز على قسيمة شراء بقيمة 1000 درهم تُستعمل في متاجر Planet Sport.</li>
        <li>عدد القسائم محدود في كل متجر وفي كل يوم.</li>
        <li>القسيمة شخصية، ولا يمكن استبدالها بمبلغ مالي أو التنازل عنها أو تعويضها.</li>
      </ul>

      <h2>تسلّم القسيمة</h2>
      <ul>
        <li>قدّم رمز الفوز عند الصندوق في المتجر الذي لعبت فيه.</li>
        <li>أحضر الهاتف الذي استعملته للعب وبطاقة التعريف.</li>
        <li>
          يوافق الفائز على التقاط صورة له داخل المتجر، ويأذن لـ Planet Sport بنشرها مع اسمه الشخصي على شبكاتها
          الاجتماعية دون مقابل.
        </li>
      </ul>

      <h2>معطياتك الشخصية</h2>
      <p>
        تعالج Planet Sport المعلومات التي تدلي بها (الاسم، العمر، رقم الهاتف، والبريد الإلكتروني إن أدليت به)
        لتدبير مشاركتك، ومنع المشاركات المتعددة، وتسليم الجوائز. ولا تُستعمل لإرسال العروض إلا إذا وضعت علامة
        في الخانة المخصصة لذلك. تتم هذه المعالجة وفقاً للقانون رقم 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه
        معالجة المعطيات ذات الطابع الشخصي. ولك حق الولوج إلى معطياتك وتصحيحها والتعرض عليها، بالتوجه إلى
        Planet Sport.
      </p>

      <h2>الغش والمسؤولية</h2>
      <p>
        كل معلومة كاذبة أو محاولة لتجاوز حد المشاركة الواحدة تؤدي إلى إلغاء المشاركة والجائزة. يحق لـ Planet
        Sport تعديل اللعبة أو تعليقها أو إيقافها في أي وقت إذا اقتضت الظروف ذلك، دون أن تتحمل أي مسؤولية.
        ولا تتحمل Planet Sport مسؤولية أي مشكل في الاتصال أو عطل تقني خارج عن إرادتها.
      </p>

      <h2>القانون المطبق</h2>
      <p>تخضع هذه القواعد للقانون المغربي. كل نزاع لم يُحل ودياً يرجع إلى المحاكم المختصة بالدار البيضاء.</p>
    </main>
  );
}

export default async function Reglement({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  // N'importe quelle ville donne accès aux réglages communs (âge minimum).
  const state = await rpc<GameState | { found: false }>('game_state', { slug: 'casablanca', device_id: '' }).catch(
    () => null,
  );
  const minAge = state && state.found ? state.min_age : 18;
  return lang === 'ar' ? <Arabic minAge={minAge} /> : <French minAge={minAge} />;
}
