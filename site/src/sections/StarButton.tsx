import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { GITHUB_URL } from './TopBar.tsx';

/**
 * A link to the repo that asks for a star. The hint shows as a tooltip on hover and keyboard
 * focus; where there is room for it (and on touch screens, which have no hover) pass `hintShown`
 * to print it next to the button instead.
 */
export function StarButton({ className = '', hintShown = false }: { className?: string; hintShown?: boolean }) {
  const { t } = useTranslation();
  const hint = useId();
  return (
    <span className={hintShown ? 'star hint-shown' : 'star'}>
      <a className={`pill ${className}`} href={GITHUB_URL} rel="noopener" aria-describedby={hint}>
        <span aria-hidden="true">★</span> {t('star.label')}
      </a>
      <span id={hint} className="star-hint" role={hintShown ? undefined : 'tooltip'}>
        {t('star.hint')}
      </span>
    </span>
  );
}
