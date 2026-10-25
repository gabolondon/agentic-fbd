import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StarButton } from './StarButton.tsx';

const COMMANDS = ['/plugin marketplace add gabolondon/agentic-fbd', '/plugin install agentic-fbd@agentic-fbd'];

function Command({ text }: { text: string }) {
  const { t } = useTranslation();
  const code = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard access: select the command so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(code.current!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
    }
  }

  return (
    <div className="command">
      <code ref={code}>{text}</code>
      <button type="button" className="pill" onClick={() => void copy()}>
        {copied ? t('install.copied') : t('install.copy')}
      </button>
    </div>
  );
}

export function Install() {
  const { t } = useTranslation();
  return (
    <section className="section install" id="install">
      <p className="label">{t('install.label')}</p>
      <h2 className="display install-title">{t('install.title')}</h2>
      <p className="install-lead">{t('install.lead')}</p>
      <div className="commands">
        {COMMANDS.map((c) => (
          <Command key={c} text={c} />
        ))}
      </div>
      <p className="install-note">{t('install.note')}</p>
      <StarButton className="solid" hintShown />
    </section>
  );
}
