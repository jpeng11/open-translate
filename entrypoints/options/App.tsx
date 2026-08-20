import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { getSettings, saveSettings, LANGUAGES, DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import { PRESETS } from '@/lib/presets';

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'focus:border-blue-500 focus:outline-none';

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [presetId, setPresetId] = useState('custom');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      const match = PRESETS.find((p) => p.baseUrl === s.baseUrl);
      setPresetId(match?.id ?? 'custom');
      setLoaded(true);
    });
  }, []);

  const preset = PRESETS.find((p) => p.id === presetId);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setTestResult(null);
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p && p.id !== 'custom') {
      update({ baseUrl: p.baseUrl, model: p.model });
    }
  };

  const save = async () => {
    await saveSettings(settings);
    setSaved(true);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await browser.runtime.sendMessage({ type: 'testConnection', settings });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <div className="p-8 text-sm">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Open Translate settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect your own AI model. Your API key stays in this browser and is only sent to the
        endpoint you configure below.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">AI provider</h2>

        <label className="mt-3 block text-xs text-slate-600">
          Preset
          <select
            className={inputClass}
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {preset?.note && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {preset.note}
          </p>
        )}

        <label className="mt-3 block text-xs text-slate-600">
          Base URL (OpenAI-compatible)
          <input
            className={inputClass}
            type="url"
            placeholder="https://api.openai.com/v1"
            value={settings.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
        </label>

        <label className="mt-3 block text-xs text-slate-600">
          API key
          <div className="mt-1 flex gap-2">
            <input
              className={`${inputClass} mt-0 flex-1`}
              type={showKey ? 'text' : 'password'}
              placeholder="sk-…"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
            />
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 text-xs hover:bg-slate-100"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <label className="mt-3 block text-xs text-slate-600">
          Model
          <input
            className={inputClass}
            type="text"
            placeholder="gpt-4o-mini"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
            disabled={testing || !settings.baseUrl || !settings.model}
            onClick={() => void test()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {testResult && (
            <span className={`text-xs ${testResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {testResult.ok ? '✓ ' : '✗ '}
              {testResult.message}
            </span>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Translation</h2>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <label className="block text-xs text-slate-600">
            Target language
            <select
              className={inputClass}
              value={settings.targetLang}
              onChange={(e) => update({ targetLang: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-600">
            Display mode
            <select
              className={inputClass}
              value={settings.displayMode}
              onChange={(e) =>
                update({ displayMode: e.target.value as Settings['displayMode'] })
              }
            >
              <option value="bilingual">Bilingual (translation under original)</option>
              <option value="translationOnly">Translation only</option>
            </select>
          </label>
        </div>

        <label className="mt-3 block text-xs text-slate-600">
          Max characters translated per page (cost guard)
          <input
            className={inputClass}
            type="number"
            min={1000}
            step={1000}
            value={settings.maxCharsPerPage}
            onChange={(e) => update({ maxCharsPerPage: Number(e.target.value) || 100_000 })}
          />
        </label>

        <label className="mt-3 block text-xs text-slate-600">
          Excluded sites (one hostname per line)
          <textarea
            className={`${inputClass} h-24 font-mono`}
            placeholder={'example.com\ndocs.internal.net'}
            value={settings.excludedSites.join('\n')}
            onChange={(e) =>
              update({
                excludedSites: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      </section>

      <div className="mt-5 flex items-center gap-3">
        <button
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => void save()}
        >
          Save
        </button>
        {saved && <span className="text-xs text-emerald-700">✓ Saved</span>}
      </div>
    </div>
  );
}
