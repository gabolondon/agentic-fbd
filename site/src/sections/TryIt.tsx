import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import shot from '../shots/try-todomvc.webp';

export const DEMO_URL = '/demo/';
const TODOMVC_URL = 'https://github.com/tastejs/todomvc';

export function TryIt() {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  // The cover keeps the page scrolling past the viewer until the visitor chooses to use it;
  // otherwise the wheel would zoom the diagram on the way down.
  const [active, setActive] = useState(false);

  function activate() {
    setActive(true);
    frame.current?.focus();
  }

  return (
    <section className="section try" id="try">
      <p className="label">{t('try.label')}</p>
      <h2 className="display try-title">{t('try.title')}</h2>
      <p className="try-lead">{t('try.lead')}</p>
      <div className="try-demo" id="try-demo">
        <div className="try-stage">
          <iframe ref={frame} className="try-frame" src={DEMO_URL} title={t('try.frameTitle')} loading="lazy" />
          {!active && (
            <button type="button" className="try-cover" onClick={activate}>
              <span className="pill solid">{t('try.start')}</span>
            </button>
          )}
        </div>
        {/* Phones get a picture and a link: the viewer is made for a large screen. */}
        <a className="try-shot" href={DEMO_URL}>
          <img src={shot} alt={t('try.shotAlt')} width={2560} height={1600} loading="lazy" />
        </a>
      </div>
      <div className="try-actions">
        <a className="pill solid" href={DEMO_URL} target="_blank" rel="noopener">
          {t('try.open')} <span aria-hidden="true">↗</span>
        </a>
        <p className="try-credit">
          {t('try.creditStart')}{' '}
          <a href={TODOMVC_URL} rel="noopener">
            TodoMVC
          </a>{' '}
          {t('try.creditEnd')}
        </p>
      </div>
    </section>
  );
}
