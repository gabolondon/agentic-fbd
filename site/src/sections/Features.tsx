import { useTranslation } from 'react-i18next';
import beforeAfter from '../shots/before-after.webp';
import codeLocations from '../shots/code-locations.webp';
import dataBox from '../shots/data-box.webp';
import editCopy from '../shots/edit-copy.webp';
import livingDocs from '../shots/living-docs.webp';
import modesDesign from '../shots/modes-design.webp';
import modesUnderstand from '../shots/modes-understand.webp';

interface Shot {
  src: string;
  alt: string; // i18n key
  width: number;
  height: number;
}

interface Feature {
  id: string;
  shots: Shot[];
  violet?: boolean;
}

// Screenshots are 2x captures of a 1280px-wide viewer window.
const full = (src: string, alt: string): Shot => ({ src, alt, width: 2560, height: 1600 });
const short = (src: string, alt: string): Shot => ({ src, alt, width: 2560, height: 1200 });

const FEATURES: Feature[] = [
  {
    id: 'understand-design',
    shots: [
      short(modesUnderstand, 'features.understand-design.alt'),
      short(modesDesign, 'features.understand-design.altDesign'),
    ],
  },
  { id: 'data-box', shots: [full(dataBox, 'features.data-box.alt')], violet: true },
  { id: 'before-after', shots: [full(beforeAfter, 'features.before-after.alt')] },
  { id: 'code-locations', shots: [full(codeLocations, 'features.code-locations.alt')] },
  { id: 'edit-copy', shots: [full(editCopy, 'features.edit-copy.alt')], violet: true },
  { id: 'living-docs', shots: [full(livingDocs, 'features.living-docs.alt')] },
];

export function Features() {
  const { t } = useTranslation();
  return (
    <section className="section" id="features">
      <p className="label">{t('features.label')}</p>
      <ol className="features">
        {FEATURES.map((f, i) => (
          <li key={f.id}>
            <article
              id={f.id}
              className={['feature', f.violet && 'violet', f.shots.length > 1 && 'pair'].filter(Boolean).join(' ')}
            >
              <div className="feature-text">
                <span className="feature-number">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="display feature-title">{t(`features.${f.id}.title`)}</h3>
                <p>{t(`features.${f.id}.body`)}</p>
              </div>
              <div className="feature-shots">
                {f.shots.map((shot) => (
                  <img
                    key={shot.src}
                    src={shot.src}
                    alt={t(shot.alt)}
                    width={shot.width}
                    height={shot.height}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
