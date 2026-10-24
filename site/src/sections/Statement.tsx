import { useTranslation } from 'react-i18next';
import overview from '../shots/modes-understand.webp';

export function Statement() {
  const { t } = useTranslation();
  return (
    <div className="statement-band">
      {/* A real diagram behind the words, faded into the canvas from the middle down. */}
      <img className="statement-bg" src={overview} alt="" aria-hidden="true" width={2560} height={1200} />
      <section className="section statement" id="statement">
        <h2 className="display statement-title">{t('statement.title')}</h2>
        <div className="statement-text">
          <p className="statement-lead">{t('statement.lead')}</p>
          <p className="statement-agents">
            {t('statement.agents')} <span className="statement-codex">{t('statement.codex')}</span>
          </p>
        </div>
      </section>
    </div>
  );
}
