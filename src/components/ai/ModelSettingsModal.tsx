import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import {
  AIProviderProfile,
  AIProviderType,
} from '../../types';
import {
  AIModelOption,
} from '../../services/ai/types';
import {
  getProviderProfiles,
  getActiveProviderProfile,
  setActiveProviderProfile,
  saveProfile,
  deleteProfile,
  getDefaultConfigForType,
  testProviderConnection,
  listProviderModels,
  LOCAL_PROVIDER_ID,
  saveCredentials,
  clearCredentials,
  getCredentialStatus,
} from '../../services/ai';
import { NvidiaNimEndpointProfile, NvidiaSourceType, NvidiaCapability, NvidiaAuthStrategy } from '../../services/ai/nvidia/types';
import { NVIDIA_NIM_PRESETS } from '../../services/ai/nvidia/presets';
import {
  Cpu,
  Key,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Radio,
  Sliders,
  ShieldAlert,
  Info,
  Code,
  Layers,
  Sparkles,
  FileText,
} from 'lucide-react';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActiveProfileChanged?: (profile: AIProviderProfile) => void;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  onActiveProfileChanged,
}) => {
  const { showToast } = useToast();

  const [profiles, setProfiles] = useState<AIProviderProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<AIProviderProfile>(getActiveProviderProfile());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(activeProfile.id);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<AIProviderType>('local');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [modelId, setModelId] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | undefined>(1024);
  const [timeoutMs, setTimeoutMs] = useState<number | undefined>(30000);
  const [customSystemInstructions, setCustomSystemInstructions] = useState('');
  const [streamResponses, setStreamResponses] = useState(true);

  // NVIDIA NIM Specific State
  const [nvidiaSource, setNvidiaSource] = useState<NvidiaSourceType>('nvidia_build');
  const [nvidiaCapability, setNvidiaCapability] = useState<NvidiaCapability>('chat');
  const [nvidiaAuthStrategy, setNvidiaAuthStrategy] = useState<NvidiaAuthStrategy>('nvidia_bearer');
  const [nvidiaAvailabilityLabel, setNvidiaAvailabilityLabel] = useState<string>('Free Endpoint');
  const [nvidiaEndpointPath, setNvidiaEndpointPath] = useState('/v1/chat/completions');

  // Diagnostics & Model discovery state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; status: string; message: string } | null>(null);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<AIModelOption[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<{ configured: boolean; mask: string }>({ configured: false, mask: '' });
  const [isSavingCredential, setIsSavingCredential] = useState(false);
  const [isRemovingCredential, setIsRemovingCredential] = useState(false);

  // Importer & Preview Modal States
  const [isCurlImporterOpen, setIsCurlImporterOpen] = useState(false);
  const [curlInputText, setCurlInputText] = useState('');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const isLocal = type === 'local';
  const isNvidia = type === 'nvidia_nim';

  // Reload profiles when modal opens
  useEffect(() => {
    if (isOpen) {
      const allProfiles = getProviderProfiles();
      const currentActive = getActiveProviderProfile();
      setProfiles(allProfiles);
      setActiveProfile(currentActive);
      setSelectedProfileId(currentActive.id);
      loadProfileToForm(currentActive);
    }
  }, [isOpen]);

  const refreshCredentialStatus = async (profileId: string) => {
    if (!profileId || profileId === 'new' || profileId === LOCAL_PROVIDER_ID) {
      setCredentialStatus({ configured: false, mask: '' });
      return { configured: false, mask: '' };
    }
    try {
      const status = await getCredentialStatus(profileId);
      setCredentialStatus(status);
      return status;
    } catch {
      setCredentialStatus({ configured: false, mask: '' });
      return { configured: false, mask: '' };
    }
  };

  const loadProfileToForm = (p: AIProviderProfile) => {
    setName(p.name);
    setType(p.type);
    setBaseUrl(p.baseUrl || '');
    setRememberApiKey(p.rememberApiKey ?? false);
    setModelId(p.modelId || '');
    setTemperature(p.temperature ?? 0.7);
    setMaxOutputTokens(p.maxOutputTokens);
    setTimeoutMs(p.timeoutMs || 30000);
    setCustomSystemInstructions(p.customSystemInstructions || '');
    setStreamResponses(p.stream ?? p.type !== 'local');

    // Saved credentials are never read back into renderer state.
    setApiKey('');
    setOrganizationId('');
    setShowApiKey(false);
    void refreshCredentialStatus(p.id);

    // Load NVIDIA NIM specifics if matching preset
    const preset = NVIDIA_NIM_PRESETS.find((pr) => pr.modelId === p.modelId) || NVIDIA_NIM_PRESETS[0];
    setNvidiaSource(preset.source);
    setNvidiaCapability(preset.capability);
    setNvidiaAuthStrategy(preset.authStrategy);
    setNvidiaAvailabilityLabel(preset.availabilityLabel || 'Free Endpoint');
    setNvidiaEndpointPath(preset.endpointPath);
    if (p.endpointPath) setNvidiaEndpointPath(p.endpointPath);

    setTestResult(null);
    setDiscoveredModels([]);
  };

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id);
    const p = profiles.find((prof) => prof.id === id);
    if (p) {
      loadProfileToForm(p);
    }
  };

  const handleTypeChange = (newType: AIProviderType) => {
    setType(newType);
    const defaults = getDefaultConfigForType(newType);
    if (defaults.baseUrl !== undefined) setBaseUrl(defaults.baseUrl);
    if (defaults.modelId !== undefined) setModelId(defaults.modelId);
    if (defaults.endpointPath !== undefined) setNvidiaEndpointPath(defaults.endpointPath);
    if (defaults.name && selectedProfileId === 'new') setName(defaults.name);
    setStreamResponses(defaults.stream ?? newType !== 'local');
    setTestResult(null);
    setDiscoveredModels([]);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = NVIDIA_NIM_PRESETS.find((pr) => pr.id === presetId);
    if (!preset) return;

    setName(preset.displayName);
    setType('nvidia_nim');
    setBaseUrl(preset.baseUrl);
    setModelId(preset.modelId);
    setNvidiaSource(preset.source);
    setNvidiaCapability(preset.capability);
    setNvidiaAuthStrategy(preset.authStrategy);
    setNvidiaAvailabilityLabel(preset.availabilityLabel || 'Free Endpoint');
    setNvidiaEndpointPath(preset.endpointPath);

    showToast('NVIDIA Preset Applied', 'info', `Loaded configuration for ${preset.displayName}`);
  };

  const handleAddNewClick = () => {
    setSelectedProfileId('new');
    setName('NVIDIA Build — DeepSeek V4 Flash');
    setType('nvidia_nim');
    setBaseUrl('https://integrate.api.nvidia.com');
    setApiKey('');
    setOrganizationId('');
    setRememberApiKey(false);
    setModelId('deepseek-ai/deepseek-v4-flash');
    setTemperature(0.7);
    setMaxOutputTokens(1024);
    setTimeoutMs(30000);
    setCustomSystemInstructions('');
    setStreamResponses(true);
    setNvidiaSource('nvidia_build');
    setNvidiaCapability('chat');
    setNvidiaAuthStrategy('nvidia_bearer');
    setNvidiaAvailabilityLabel('Free Endpoint');
    setNvidiaEndpointPath('/v1/chat/completions');
    setTestResult(null);
    setDiscoveredModels([]);
    setCredentialStatus({ configured: false, mask: '' });
  };

  const handleParseCurlImport = () => {
    if (!curlInputText.trim()) return;

    // Safe cURL text parser (strips secrets, no code execution)
    let extractedUrl = '';
    let extractedModel = modelId;

    const urlMatch = curlInputText.match(/https?:\/\/[^\s'"]+/);
    if (urlMatch) {
      extractedUrl = urlMatch[0];
    }

    const modelMatch = curlInputText.match(/"model":\s*"([^"]+)"/);
    if (modelMatch) {
      extractedModel = modelMatch[1];
    }

    if (extractedUrl) {
      try {
        const u = new URL(extractedUrl);
        setBaseUrl(u.origin);
        setNvidiaEndpointPath(u.pathname);
      } catch {
        setBaseUrl(extractedUrl);
      }
    }

    if (extractedModel) {
      setModelId(extractedModel);
    }

    setIsCurlImporterOpen(false);
    setCurlInputText('');
    showToast('cURL Imported', 'success', 'Parsed request URL and model ID safely without credential exposure.');
  };

  const persistProfileMetadata = (): AIProviderProfile => {
    const saved = saveProfile({
      id: selectedProfileId === 'new' ? undefined : selectedProfileId,
      name: name.trim(),
      type,
      baseUrl: baseUrl.trim(),
      endpointPath: isNvidia ? nvidiaEndpointPath.trim() : undefined,
      rememberApiKey: type !== 'local',
      modelId: modelId.trim() || 'default-model',
      temperature,
      maxOutputTokens,
      timeoutMs,
      stream: streamResponses,
      customSystemInstructions: customSystemInstructions.trim(),
    });
    setProfiles(getProviderProfiles());
    setSelectedProfileId(saved.id);
    return saved;
  };

  const buildCurrentProfile = (profileId: string): AIProviderProfile => ({
    id: profileId,
    name,
    type,
    baseUrl,
    endpointPath: isNvidia ? nvidiaEndpointPath : undefined,
    modelId,
    temperature,
    maxOutputTokens,
    timeoutMs,
    stream: streamResponses,
    customSystemInstructions,
    rememberApiKey: type !== 'local',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const requireConfiguredCredential = async (): Promise<string> => {
    if (selectedProfileId === 'new') {
      throw new Error('Save the API credential before using this provider.');
    }
    const status = await refreshCredentialStatus(selectedProfileId);
    if (!status.configured) {
      throw new Error('No API credential is configured. Enter and save an API key first.');
    }
    return selectedProfileId;
  };

  const handleSaveCredential = async () => {
    if (!apiKey.trim()) {
      showToast('Credential Not Saved', 'error', 'Enter an API key before saving.');
      return;
    }
    setIsSavingCredential(true);
    try {
      const saved = persistProfileMetadata();
      await saveCredentials(saved.id, {
        apiKey: apiKey.trim(),
        organizationId: organizationId.trim() || undefined,
      });
      setApiKey('');
      setOrganizationId('');
      setShowApiKey(false);
      await refreshCredentialStatus(saved.id);
      showToast('Credential Saved', 'success', 'API key saved with operating-system encryption.');
    } catch (err: any) {
      showToast('Credential Could Not Be Saved', 'error', err.message || 'Secure credential storage failed.');
    } finally {
      setIsSavingCredential(false);
    }
  };

  const handleRemoveCredential = async () => {
    if (selectedProfileId === 'new') return;
    setIsRemovingCredential(true);
    try {
      await clearCredentials(selectedProfileId);
      setApiKey('');
      setOrganizationId('');
      await refreshCredentialStatus(selectedProfileId);
      showToast('Credential Removed', 'success', 'The saved API credential was removed.');
    } catch (err: any) {
      showToast('Credential Could Not Be Removed', 'error', err.message || 'Credential removal failed.');
    } finally {
      setIsRemovingCredential(false);
    }
  };

  const handleTestConnection = async () => {
    if (isTesting) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const profileId = await requireConfiguredCredential();
      const res = await testProviderConnection(buildCurrentProfile(profileId));
      setTestResult({
        success: res.success,
        status: res.status || 'PROVIDER_ERROR',
        message: res.message,
      });
      if (res.success) {
        showToast('Connection Successful', 'success', res.message);
      } else {
        showToast('Connection Test Failed', 'error', `${res.status}: ${res.message}`);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'Error',
        message: err.message || 'Connection test failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRefreshModels = async () => {
    if (isRefreshingModels) return;
    setIsRefreshingModels(true);

    try {
      const profileId = await requireConfiguredCredential();
      const models = await listProviderModels(buildCurrentProfile(profileId));
      if (models.length === 0) {
        throw new Error('No models were returned by the provider.');
      }
      setDiscoveredModels(models);
      showToast('Models Discovered', 'success', `Found ${models.length} available models.`);
    } catch (err: any) {
      setDiscoveredModels([]);
      showToast('Model Refresh Failed', 'error', err.message || 'Could not retrieve the provider model list.');
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const handleSave = (): AIProviderProfile | undefined => {
    try {
      const saved = persistProfileMetadata();
      showToast('Profile Saved', 'success', `Saved configuration for ${saved.name}`);
      return saved;
    } catch (err: any) {
      showToast('Validation Error', 'error', err.message);
      return undefined;
    }
  };

  const handleSetActive = () => {
    const saved = handleSave();
    if (!saved) return;
    const active = setActiveProviderProfile(saved.id);
    setActiveProfile(active);
    if (onActiveProfileChanged) {
      onActiveProfileChanged(active);
    }
    showToast('Active Model Updated', 'success', `Active AI Provider set to ${active.name} (${active.modelId})`);
  };

  const handleDeleteConfirmed = () => {
    if (selectedProfileId === LOCAL_PROVIDER_ID || selectedProfileId === 'new') return;

    deleteProfile(selectedProfileId);
    const updatedProfiles = getProviderProfiles();
    const newActive = getActiveProviderProfile();

    setProfiles(updatedProfiles);
    setActiveProfile(newActive);
    setSelectedProfileId(newActive.id);
    loadProfileToForm(newActive);
    setIsDeleteConfirmOpen(false);

    if (onActiveProfileChanged) {
      onActiveProfileChanged(newActive);
    }

    showToast('Profile Deleted', 'info', 'Provider profile removed. Its credential remains available until explicitly removed.');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Model & AI API Configuration" maxWidth="2xl">
      <div className="space-y-6 text-[var(--text-primary)]">
        {/* Profile Selector Tabs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Provider Profiles
            </label>
            <Button variant="ghost" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleAddNewClick}>
              Add Profile
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => {
              const isActive = p.id === activeProfile.id;
              const isSelected = p.id === selectedProfileId;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectProfile(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-purple)]/15 border-[var(--accent-purple)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5 text-[var(--accent-purple)]" />
                  <span>{p.name}</span>
                  {isActive && <Badge variant="purple" size="sm">Active</Badge>}
                </button>
              );
            })}
          </div>
        </div>

        {/* NVIDIA NIM Preset Selector Panel (Section 25 & 9) */}
        <div className="p-4 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--accent-purple)]">
              <Sparkles className="w-4 h-4 text-[var(--accent-purple)]" />
              NVIDIA NIM APIs Platform Presets
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={<Code className="w-3.5 h-3.5" />} onClick={() => setIsCurlImporterOpen(true)}>
                Import cURL Example
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NVIDIA_NIM_PRESETS.slice(0, 6).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
                className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-glass)] hover:border-[var(--accent-purple)]/50 text-left transition-all cursor-pointer group space-y-1"
              >
                <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-purple)] flex items-center justify-between">
                  <span>{preset.displayName}</span>
                  <Badge variant="purple" size="sm">{preset.availabilityLabel || 'Preset'}</Badge>
                </div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                  {preset.modelId} ({preset.capability})
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Profile Details Form */}
        <div className="p-4 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-glass)]">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[var(--accent-blue)]" />
              <span className="text-sm font-bold">
                {selectedProfileId === 'new' ? 'New Provider Profile' : `Configure: ${name}`}
              </span>
            </div>

            {selectedProfileId !== LOCAL_PROVIDER_ID && selectedProfileId !== 'new' && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4 text-[var(--accent-rose)]" />}
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                Delete Profile
              </Button>
            )}
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Profile Name */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Profile Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NVIDIA Build — DeepSeek V4 Flash"
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
              />
            </div>

            {/* Provider Type */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Provider Type</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as AIProviderType)}
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
              >
                <option value="nvidia_nim">NVIDIA NIM Platform (Catalog, NVCF & Self-Hosted)</option>
                <option value="local">Local Offline Synthesizer (0 Key / Offline)</option>
                <option value="openai_compatible">Custom OpenAI-Compatible API</option>
                <option value="openai">OpenAI Official (GPT-4o)</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter API</option>
                <option value="ollama">Ollama (Local Host)</option>
                <option value="lmstudio">LM Studio (Local Host)</option>
              </select>
            </div>

            {/* NVIDIA NIM Specific Recipe Controls */}
            {isNvidia && (
              <>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">Endpoint Source</label>
                  <select
                    value={nvidiaSource}
                    onChange={(e) => setNvidiaSource(e.target.value as NvidiaSourceType)}
                    className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
                  >
                    <option value="nvidia_build">NVIDIA Build Hosted (integrate.api.nvidia.com)</option>
                    <option value="nvcf_invocation">NVCF Invocation Endpoint (*.invocation.api.nvcf.nvidia.com)</option>
                    <option value="self_hosted_nim">Self-Hosted NIM Deployment (localhost / private NIM)</option>
                    <option value="partner_endpoint">NVIDIA Partner Endpoint</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">Capability</label>
                  <select
                    value={nvidiaCapability}
                    onChange={(e) => setNvidiaCapability(e.target.value as NvidiaCapability)}
                    className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
                  >
                    <option value="chat">Chat / LLM (v1/chat/completions)</option>
                    <option value="responses">OpenAI Responses API (v1/responses)</option>
                    <option value="messages">Anthropic Messages API (v1/messages)</option>
                    <option value="embeddings">Embeddings (v1/embeddings)</option>
                    <option value="reranking">Reranking (v1/ranking)</option>
                    <option value="vision">Vision / Multimodal</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">Endpoint Path</label>
                  <input
                    type="text"
                    value={nvidiaEndpointPath}
                    onChange={(e) => setNvidiaEndpointPath(e.target.value)}
                    placeholder="/v1/chat/completions"
                    className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-purple)]"
                  />
                </div>
              </>
            )}

            {/* Base URL */}
            {!isLocal && (
              <div className="space-y-1 sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                  API Base Endpoint URL
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://integrate.api.nvidia.com or http://localhost:8000"
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-purple)]"
                />
              </div>
            )}

            {/* API Key Credentials */}
            {!isLocal && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                  API Secret Key
                  <Badge variant={credentialStatus.configured ? 'emerald' : 'gray'} size="sm">
                    {credentialStatus.configured ? `Configured ${credentialStatus.mask}` : 'Not configured'}
                  </Badge>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={credentialStatus.configured ? 'Enter a replacement key' : type === 'nvidia_nim' ? 'nvapi-...' : 'Enter API key'}
                    className="w-full px-3 py-2 pr-10 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-purple)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    className="absolute right-2.5 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isSavingCredential || !apiKey.trim()}
                    onClick={handleSaveCredential}
                  >
                    {isSavingCredential ? 'Saving Credential...' : 'Save API Key Securely'}
                  </Button>
                  {credentialStatus.configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRemovingCredential}
                      onClick={handleRemoveCredential}
                    >
                      {isRemovingCredential ? 'Removing...' : 'Remove Saved Key'}
                    </Button>
                  )}
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-glass)] text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-[var(--accent-amber)] shrink-0 mt-0.5" />
                  <span>
                    Saved credentials are encrypted by the Electron main process using operating-system protected storage. The complete key is never read back into this form.
                  </span>
                </div>
              </div>
            )}

            {/* Model Identifier & Discovery */}
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Model Identifier (Model ID)</label>
                {!isLocal && (
                  <button
                    type="button"
                    disabled={isRefreshingModels}
                    onClick={handleRefreshModels}
                    className="text-[11px] font-semibold text-[var(--accent-purple)] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                    Refresh Available Models
                  </button>
                )}
              </div>

              {discoveredModels.length > 0 ? (
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-purple)]"
                >
                  {discoveredModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.description ? `(${m.description})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="e.g. deepseek-ai/deepseek-v4-flash, qwen/qwen3.5-122b-a10b"
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-purple)]"
                />
              )}
            </div>

            {/* Temperature Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-[var(--text-secondary)]">
                <span>Temperature (0.0 to 2.0)</span>
                <span className="font-mono text-[var(--text-primary)]">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-[var(--accent-purple)]"
              />
            </div>

            {/* Max Tokens */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Max Output Tokens</label>
              <input
                type="number"
                value={maxOutputTokens || ''}
                onChange={(e) => setMaxOutputTokens(e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="1024"
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-purple)]"
              />
            </div>

            {!isLocal && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Response Mode</label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={streamResponses}
                    onChange={(e) => setStreamResponses(e.target.checked)}
                    className="rounded border-[var(--border-glass)] text-[var(--accent-purple)] focus:ring-0"
                  />
                  Stream responses when supported
                </label>
              </div>
            )}

            {/* Desktop transport note */}
            {!isLocal && (
              <div className="sm:col-span-2 p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-glass)] text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                <Info className="w-4 h-4 text-[var(--accent-blue)] shrink-0 mt-0.5" />
                <span>
                  Remote provider requests run through the secured Electron desktop bridge and main process; the renderer does not contact provider endpoints directly.
                </span>
              </div>
            )}
          </div>

          {/* Test Diagnostic Result Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-[var(--accent-emerald)]/10 border-[var(--accent-emerald)]/30 text-[var(--accent-emerald)]'
                  : 'bg-[var(--accent-rose)]/10 border-[var(--accent-rose)]/30 text-[var(--accent-rose)]'
              }`}
            >
              {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                <div className="font-bold">{testResult.status}</div>
                <div className="text-[11px] leading-relaxed mt-0.5">{testResult.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--border-glass)]">
          {!isLocal ? (
            <Button
              variant="secondary"
              size="md"
              disabled={isTesting}
              onClick={handleTestConnection}
              icon={<Radio className={`w-4 h-4 ${isTesting ? 'animate-pulse' : ''}`} />}
            >
              {isTesting ? 'Testing Connection...' : 'Test Connection'}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>

            <Button variant="secondary" size="md" onClick={handleSave}>
              Save Profile
            </Button>

            <Button variant="purple" size="md" onClick={handleSetActive}>
              Set as Active Provider
            </Button>
          </div>
        </div>
      </div>

      {/* cURL Importer Sub-Modal (Section 10) */}
      <Modal
        isOpen={isCurlImporterOpen}
        onClose={() => setIsCurlImporterOpen(false)}
        title="Import Request Example (cURL / Text)"
      >
        <div className="space-y-4 text-xs text-[var(--text-primary)]">
          <p className="text-[var(--text-secondary)]">
            Paste a cURL command or API request example from the NVIDIA API Reference. Aether will parse the URL and model ID safely. Secret values are automatically stripped and replaced with secret placeholders. No pasted code is executed.
          </p>

          <textarea
            value={curlInputText}
            onChange={(e) => setCurlInputText(e.target.value)}
            placeholder={`curl -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \\\n  -H "Authorization: Bearer nvapi-..." \\\n  -d '{"model": "deepseek-ai/deepseek-v4-flash"}'`}
            className="w-full h-32 p-3 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)] resize-none"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" onClick={() => setIsCurlImporterOpen(false)}>
              Cancel
            </Button>
            <Button variant="purple" size="md" onClick={handleParseCurlImport}>
              Parse Request Safely
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Sub-Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Delete Provider Profile?"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-primary)]">
            Are you sure you want to delete profile <strong>"{name}"</strong>? Deleting the active profile will safely fall back to the Local Offline Synthesizer. Saved credentials are managed separately.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={handleDeleteConfirmed}>
              Delete Profile
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};
