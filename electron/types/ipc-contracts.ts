export enum IPCChannel {
  AI_GENERATE = 'aether:ai:generate',
  AI_STREAM_START = 'aether:ai:stream-start',
  AI_STREAM_CHUNK = 'aether:ai:stream-chunk',
  AI_CANCEL = 'aether:ai:cancel',
  AI_TEST_CONNECTION = 'aether:ai:test-connection',
  AI_LIST_MODELS = 'aether:ai:list-models',

  CREDENTIALS_SET = 'aether:credentials:set',
  CREDENTIALS_HAS = 'aether:credentials:has',
  CREDENTIALS_REMOVE = 'aether:credentials:remove',
  CREDENTIALS_GET_STATUS = 'aether:credentials:get-status',

  FILES_OPEN = 'aether:files:open',
  FILES_SAVE = 'aether:files:save',

  SOURCES_SELECT_AND_STAGE = 'aether:sources:select-and-stage',
  SOURCES_FINALISE = 'aether:sources:finalise',
  SOURCES_READ_TEXT_ASSET = 'aether:sources:read-text-asset',
  SOURCES_CANCEL = 'aether:sources:cancel',
  SOURCES_RECONCILE = 'aether:sources:reconcile',
  SOURCES_GET_CAPABILITIES = 'aether:sources:get-capabilities',
  SOURCES_PDF_EXTRACT = 'aether:sources:pdf-extract',
  SOURCES_PDF_CANCEL = 'aether:sources:pdf-cancel',
  SOURCES_PDF_PROGRESS = 'aether:sources:pdf-progress',
  SOURCES_PDF_VIEWER_GRANT = 'aether:sources:pdf-viewer-grant',
  SOURCES_PDF_VIEWER_REVOKE = 'aether:sources:pdf-viewer-revoke',

  APP_GET_INFO = 'aether:app:get-info',
  APP_GET_VERSION = 'aether:app:get-version',
  APP_GET_PLATFORM = 'aether:app:get-platform',

  WINDOW_MINIMIZE = 'aether:window:minimize',
  WINDOW_MAXIMIZE = 'aether:window:maximize',
  WINDOW_CLOSE = 'aether:window:close',
}
