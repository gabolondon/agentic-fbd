import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from './LanguageSwitch.tsx';
import { GITHUB_URL } from './TopBar.tsx';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <p>
        <a href={`${GITHUB_URL}/blob/main/LICENSE`} rel="noopener">
          {t('footer.license')}
        </a>{' '}
        · {t('footer.madeBy')}
      </p>
      <LanguageSwitch />
    </footer>
  );
}
