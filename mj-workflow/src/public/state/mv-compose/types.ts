import type { ApiClient } from '../../adapters/api';
import type { Store } from '../store';
import type { MediaAsset, WorkflowState } from '../workflow';

export type MvComposeBlockParams = { api: ApiClient; store: Store<WorkflowState> };

export type MvComposeBlock = {
  cook: (recipe: MvRecipeMode) => Promise<void>;
};

export type MvComposeParams = Parameters<ApiClient['mvCompose']>[0];

export type MvRecipeMode = 'mv-mix' | 'mv-images' | 'mv-clip' | 'mv-subtitle';

export type MvComposeDom = {
  promptInput: HTMLTextAreaElement;
};

export type MvComposeCtx = {
  api: ApiClient;
  store: Store<WorkflowState>;
  dom: MvComposeDom;
  pollers: Map<string, { stop: () => void }>;
};

export type BuiltMvComposePayload = {
  state: WorkflowState;
  text: string;
  selectedRefIds: string[];
  inputImageUrls: string[];
  action: 'mv' | 'clip';
  videoAsset?: MediaAsset;
  audioAsset?: MediaAsset;
  subtitleAsset?: MediaAsset;
  payload: MvComposeParams;
};
