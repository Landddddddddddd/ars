import type { ProviderOverride, ProviderPreset } from '../api.js';

export interface SettingsState {
  presetId: string;
  model: string;
  baseURL: string;
  apiKey: string;
}

export const DEFAULT_SETTINGS: SettingsState = {
  presetId: 'default',
  model: '',
  baseURL: '',
  apiKey: '',
};

/** Build the request override from settings. Returns null for the server default. */
export function buildOverride(
  s: SettingsState,
  presets: ProviderPreset[],
): ProviderOverride | null {
  if (s.presetId === 'default') return null;
  const preset = presets.find((p) => p.id === s.presetId);
  if (!preset) return null;
  const model = s.model.trim() || preset.models[0] || '';
  const baseURL = s.baseURL.trim() || preset.baseURL || undefined;
  const key = s.apiKey.trim() || undefined;
  const override: ProviderOverride = { provider: preset.provider, model, baseURL };
  // Anthropic relays authenticate with a bearer token; everything else uses an API key.
  if (preset.provider === 'anthropic' && s.presetId === 'anthropic-relay') {
    override.authToken = key;
  } else {
    override.apiKey = key;
  }
  return override;
}

export function Settings({
  presets,
  value,
  onChange,
  disabled,
}: {
  presets: ProviderPreset[];
  value: SettingsState;
  onChange: (s: SettingsState) => void;
  disabled?: boolean;
}) {
  const preset = presets.find((p) => p.id === value.presetId);
  const isDefault = value.presetId === 'default';

  const selectPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    onChange({
      presetId: id,
      model: p?.models[0] ?? '',
      baseURL: p?.baseURL ?? '',
      apiKey: '', // clear key when switching provider
    });
  };

  return (
    <details className="settings">
      <summary>
        模型设置 · <span className="muted">{preset?.label ?? value.presetId}</span>
        {!isDefault && value.model ? ` / ${value.model}` : ''}
      </summary>
      <div className="settings-body">
        <label>
          提供商
          <select
            value={value.presetId}
            disabled={disabled}
            onChange={(e) => selectPreset(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {isDefault ? (
          <p className="muted">使用服务器 <code>.env</code> 中的凭据，无需填写。</p>
        ) : (
          <>
            <label>
              模型
              <input
                value={value.model}
                placeholder={preset?.models[0] ?? 'model id'}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, model: e.target.value })}
              />
            </label>
            <label>
              Base URL
              <input
                value={value.baseURL}
                placeholder={preset?.baseURL ?? 'https://...'}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, baseURL: e.target.value })}
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={value.apiKey}
                placeholder="sk-..."
                disabled={disabled}
                onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              />
            </label>
            <p className="muted">
              {preset?.note ?? ''} Key 仅保存在本浏览器（localStorage），随请求发到本地服务器转发给你选的提供商。
            </p>
          </>
        )}
      </div>
    </details>
  );
}
