import {
  NormalizedAIResponse,
  AIConnectionTestResult,
  AIModelOption,
  AIStreamHandlers,
} from './types';
import { desktopBridge } from '../../desktop/desktopBridge';

/**
 * Request shape sent to the AI transport (desktop bridge or web fallback).
 * The frontend never sends raw API keys in this payload.
 */
export interface AITransportChatRequest {
  requestId?: string;
  profileId: string;
  providerType: string;
  baseUrl: string;
  endpoint?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  extraBody?: Record<string, unknown>;
}

export interface AITransportTestRequest {
  profileId: string;
  providerType: string;
  baseUrl: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}

export interface AITransportModelsRequest {
  profileId: string;
  providerType: string;
  baseUrl: string;
}

export interface CredentialStatus {
  configured: boolean;
  mask: string;
}

/**
 * Aether AI Transport — unified client delegating to desktopBridge (Electron IPC when in desktop mode,
 * or Express proxy / local fallback when in web mode).
 */
export const aetherTransport = {
  async send(
    request: AITransportChatRequest,
    signal?: AbortSignal
  ): Promise<NormalizedAIResponse> {
    return desktopBridge.send(request, signal);
  },

  async stream(
    request: AITransportChatRequest,
    handlers: AIStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    return desktopBridge.stream(request, handlers, signal);
  },

  async testConnection(
    request: AITransportTestRequest,
    signal?: AbortSignal
  ): Promise<AIConnectionTestResult> {
    return desktopBridge.testConnection(request, signal);
  },

  async listModels(
    request: AITransportModelsRequest,
    signal?: AbortSignal
  ): Promise<AIModelOption[]> {
    return desktopBridge.listModels(request, signal);
  },

  async saveCredential(
    profileId: string,
    apiKey: string,
    organizationId?: string
  ): Promise<{ success: boolean; mask: string }> {
    return desktopBridge.saveCredential(profileId, apiKey, organizationId);
  },

  async deleteCredential(profileId: string): Promise<void> {
    return desktopBridge.deleteCredential(profileId);
  },

  async getCredentialStatus(profileId: string): Promise<CredentialStatus> {
    return desktopBridge.getCredentialStatus(profileId);
  },
};
