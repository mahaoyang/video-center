export type StreamTileAction = 'pad' | 'upscale' | 'select' | 'selectUrl';

export type StreamTileEventDetail =
  | { action: 'pad'; src: string; index: number }
  | { action: 'upscale'; taskId: string; index: number }
  | { action: 'select'; src: string; index: number }
  | { action: 'selectUrl'; src: string };

export const STREAM_TILE_EVENT = 'mj:stream-tile' as const;

export function dispatchStreamTileEvent(detail: StreamTileEventDetail) {
  document.dispatchEvent(new CustomEvent<StreamTileEventDetail>(STREAM_TILE_EVENT, { detail }));
}

export function onStreamTileEvent(handler: (detail: StreamTileEventDetail) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<StreamTileEventDetail>).detail);
  document.addEventListener(STREAM_TILE_EVENT, listener);
  return () => document.removeEventListener(STREAM_TILE_EVENT, listener);
}
