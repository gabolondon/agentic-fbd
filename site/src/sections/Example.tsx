import { useTranslation } from 'react-i18next';
import wireThumb from '../shots/wire-thumb.webp';

export function Example() {
  const { t } = useTranslation();
  return (
    <section className="section" id="example">
      <p className="label">{t('example.label')}</p>
      <h2 className="display example-title">
        {t('example.titleStart')}{' '}
        <img className="example-thumb" src={wireThumb} alt={t('example.thumbAlt')} width={624} height={208} />{' '}
        {t('example.titleEnd')}
      </h2>
      <div className="example-text">
        <p>{t('example.story')}</p>
        <p>{t('example.fix')}</p>
      </div>
    </section>
  );
}
