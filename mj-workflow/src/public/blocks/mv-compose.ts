import type { MvComposeBlock, MvComposeBlockParams, MvComposeCtx } from '../state/mv-compose/types';
import { byId } from '../atoms/ui';
import { createMvComposeActions } from '../state/mv-compose/tasks';

export function createMvComposeBlock(params: MvComposeBlockParams): MvComposeBlock {
  const promptInput = byId<HTMLTextAreaElement>('promptInput');
  const ctx: MvComposeCtx = { api: params.api, store: params.store, dom: { promptInput }, pollers: new Map() };
  const actions = createMvComposeActions(ctx);

  return {
    cook: actions.cook,
  };
}
