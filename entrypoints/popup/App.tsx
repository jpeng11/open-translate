import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { getSettings, saveSettings, LANGUAGES } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import type { PageState } from '@/lib/messaging';

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pageState, setPageState] = useState<PageState | null>(null);
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setSettings(await getSettings());
    const tab = await activeTab();
    if (tab?.url) {
      try {
        setHostname(new URL(tab.url).hostname);
      } catch {
        setHostname('');
      }
    }
    if (tab?.id) {
      try {
        setPageState(await browser.tabs.sendMessage(tab.id, { type: 'getPageState' }));
      } catch {
        setPageState(null); // content script not present (chrome:// page or pre-install tab)
      }
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const send = async (type: 'translatePage' | 'restorePage') => {
    setBusy(true);
    setError('');
    try {
      const tab = await activeTab();
      if (!tab?.id) throw new Error('No active tab');
      await browser.tabs.sendMessage(tab.id, { type });
      await refresh();
    } catch {
      setError('Cannot translate this page. Reload the tab and try again.');
    } finally {
      setBusy(false);
    }
  };

  const update = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  const toggleExcluded = async () => {
    if (!settings || !hostname) return;
    const excluded = settings.excludedSites.includes(hostname)
      ? settings.excludedSites.filter((s) => s !== hostname)
      : [...settings.excludedSites, hostname];
    await update({ excludedSites: excluded });
  };

  if (!settings) return <div className="w-72 p-4 text-sm">Loading…</div>;

  const configured =
    settings.authMode === 'grokOauth'
      ? settings.grokTokens !== null
      : settings.apiKey !== '' || settings.baseUrl.includes('localhost');
  const isExcluded = hostname !== '' && settings.excludedSites.includes(hostname);
  let providerHost = settings.baseUrl;
  try {
    providerHost = new URL(settings.baseUrl).hostname;
  } catch {
    // keep raw string
  }

  return (
    <div className="w-72 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Open Translate</h1>
        <button
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          Settings
        </button>
      </div>

      <div
        className={`rounded-md px-3 py-2 text-xs ${
          configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
        }`}
      >
        {configured ? (
          <>
            <span className="font-medium">{settings.model}</span> via {providerHost}
          </>
        ) : (
          <button className="underline" onClick={() => browser.runtime.openOptionsPage()}>
            Configure your AI model to start
          </button>
        )}
      </div>

      <label className="block text-xs text-slate-600">
        Translate into
        <select
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={settings.targetLang}
          onChange={(e) => void update({ targetLang: e.target.value })}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={settings.displayMode === 'translationOnly'}
          onChange={(e) =>
            void update({ displayMode: e.target.checked ? 'translationOnly' : 'bilingual' })
          }
        />
        Show translation only (hide original)
      </label>

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={busy || !configured || isExcluded}
          onClick={() => void send('translatePage')}
        >
          {pageState?.translating ? 'Translating…' : 'Translate page'}
        </button>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
          disabled={busy || !pageState?.translated}
          onClick={() => void send('restorePage')}
        >
          Restore
        </button>
      </div>

      <button
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
        onClick={() =>
          void browser.tabs.create({ url: browser.runtime.getURL('/documents.html') })
        }
      >
        Translate a document (PDF / EPUB / SRT…)
      </button>

      {pageState?.translated && (
        <p className="text-xs text-slate-500">
          {pageState.blocksTranslated} blocks translated on this page.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {hostname && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={isExcluded} onChange={() => void toggleExcluded()} />
          Never translate {hostname}
        </label>
      )}
    </div>
  );
}
