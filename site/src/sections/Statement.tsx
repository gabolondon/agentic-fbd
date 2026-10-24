import { useTranslation } from 'react-i18next';

export function Statement() {
  const { t } = useTranslation();
  return (
    <section className="section statement" id="statement">
      <h2 className="display statement-title">{t('statement.title')}</h2>
      <div className="statement-text">
        <p className="statement-lead">{t('statement.lead')}</p>
        <p className="statement-agents">
          {t('statement.agents')} <span className="statement-codex">{t('statement.codex')}</span>
        </p>
      </div>
    </section>
  );
}
