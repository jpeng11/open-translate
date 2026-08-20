import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { getSettings, saveSettings, LANGUAGES, DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import type { ModelsResponse } from '@/lib/messaging';
import { PRESETS } from '@/lib/presets';
import { startDeviceFlow, pollForTokens } from '@/lib/grokAuth';
import type { DeviceCode } from '@/lib/grokAuth';

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
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [signInError, setSignInError] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const signInCancelled = useRef(false);

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      const match = PRESETS.find((p) => p.baseUrl === s.baseUrl);
      setPresetId(match?.id ?? 'custom');
      setLoaded(true);
    });
    return () => {
      signInCancelled.current = true;
    };
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
      update({ baseUrl: p.baseUrl, model: p.model, authMode: p.authMode });
    } else if (p) {
      update({ authMode: p.authMode });
    }
  };

  const signInWithGrok = async () => {
    setSignInError('');
    signInCancelled.current = false;
    try {
      const dc = await startDeviceFlow();
      setDevice(dc);
      window.open(dc.verificationUriComplete, '_blank');
      const tokens = await pollForTokens(dc, () => signInCancelled.current);
      const next = { ...settings, authMode: 'grokOauth' as const, grokTokens: tokens };
      setSettings(next);
      await saveSettings(next);
      setSaved(true);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err));
    } finally {
      setDevice(null);
    }
  };

  const signOutGrok = async () => {
    signInCancelled.current = true;
    const next = { ...settings, grokTokens: null };
    setSettings(next);
    await saveSettings(next);
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

  const fetchModels = async () => {
    setFetchingModels(true);
    setModelsError('');
    try {
      const result: ModelsResponse = await browser.runtime.sendMessage({
        type: 'listModels',
        settings,
      });
      if (!result.ok) throw new Error(result.message);
      setFetchedModels(result.models);
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingModels(false);
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

        {settings.authMode === 'grokOauth' ? (
          <div className="mt-3">
            <span className="block text-xs text-slate-600">Account</span>
            {settings.grokTokens ? (
              <div className="mt-1 flex items-center gap-3">
                <span className="text-xs text-emerald-700">✓ Signed in with X / Grok</span>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => void signOutGrok()}
                >
                  Sign out
                </button>
              </div>
            ) : device ? (
              <div className="mt-1 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">
                <p>
                  Approve the sign-in in the opened tab. If asked for a code, enter{' '}
                  <span className="font-mono text-sm font-bold">{device.userCode}</span>
                </p>
                <a
                  className="text-blue-600 underline"
                  href={device.verificationUriComplete}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the approval page again
                </a>
                <p className="mt-1 animate-pulse">Waiting for approval…</p>
              </div>
            ) : (
              <button
                type="button"
                className="mt-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                onClick={() => void signInWithGrok()}
              >
                Sign in with X (Grok)
              </button>
            )}
            {signInError && <p className="mt-1 text-xs text-red-600">✗ {signInError}</p>}
          </div>
        ) : (
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
        )}

        <label className="mt-3 block text-xs text-slate-600">
          Model
          <div className="flex gap-2">
            <input
              className={inputClass}
              type="text"
              placeholder="gpt-4o-mini"
              list="ot-model-suggestions"
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
            />
            <button
              className="mt-1 shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 disabled:opacity-50"
              disabled={fetchingModels || !settings.baseUrl}
              onClick={() => void fetchModels()}
              title="Query this provider's /models endpoint"
            >
              {fetchingModels ? 'Fetching…' : 'Fetch models'}
            </button>
          </div>
          <datalist id="ot-model-suggestions">
            {[...new Set([...(preset?.modelSuggestions ?? []), ...fetchedModels])].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {fetchedModels.length > 0 && (
            <span className="mt-1 block text-emerald-700">
              {fetchedModels.length} models available — click the field to pick one
            </span>
          )}
          {modelsError && <span className="mt-1 block text-red-600">{modelsError}</span>}
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

        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={settings.videoSubtitles}
            onChange={(e) => update({ videoSubtitles: e.target.checked })}
          />
          Bilingual video subtitles on YouTube (translates the native captions)
        </label>

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

        <label className="mt-3 block text-xs text-slate-600">
          Auto-translate sites (one hostname per line; subdomains included)
          <textarea
            className={`${inputClass} h-24 font-mono`}
            placeholder={'lemonde.fr\nnews.example.com'}
            value={settings.autoTranslateSites.join('\n')}
            onChange={(e) =>
              update({
                autoTranslateSites: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>

        <label className="mt-3 block text-xs text-slate-600">
          Glossary — forced translations, one <span className="font-mono">term = translation</span>{' '}
          per line
          <textarea
            className={`${inputClass} h-24 font-mono`}
            placeholder={'LLM = 大语言模型\nprompt = 提示词'}
            value={settings.glossary}
            onChange={(e) => update({ glossary: e.target.value })}
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
