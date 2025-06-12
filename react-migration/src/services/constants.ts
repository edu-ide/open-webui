export const APP_NAME = 'Open WebUI';

// React 환경에서는 환경변수를 다르게 처리
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:8080'; // 기본값
};

export const WEBUI_BASE_URL_NO_PREFIX = getBaseUrl();
export const WEBUI_BASE_URL = `${WEBUI_BASE_URL_NO_PREFIX}`;

export const WEBUI_API_BASE_URL = `${WEBUI_BASE_URL}/api/v1`;

export const OLLAMA_API_BASE_URL = `${WEBUI_BASE_URL}/ollama`;
export const OPENAI_API_BASE_URL = `${WEBUI_BASE_URL}/openai`;
export const AUDIO_API_BASE_URL = `${WEBUI_BASE_URL}/api/v1/audio`;
export const IMAGES_API_BASE_URL = `${WEBUI_BASE_URL}/api/v1/images`;
export const RETRIEVAL_API_BASE_URL = `${WEBUI_BASE_URL}/api/v1/retrieval`;

export const REQUIRED_OLLAMA_VERSION = '0.1.16';

export const SUPPORTED_FILE_TYPE = [
  'application/epub+zip',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/xml',
  'text/html',
  'text/x-python',
  'text/css',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  'application/x-javascript',
  'text/markdown',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a'
];

export const SUPPORTED_FILE_EXTENSIONS = [
  'md', 'rst', 'go', 'py', 'java', 'sh', 'bat', 'ps1', 'cmd', 'js', 'ts', 
  'css', 'cpp', 'hpp', 'h', 'c', 'cs', 'htm', 'html', 'sql', 'log', 'ini', 
  'pl', 'pm', 'r', 'dart', 'dockerfile', 'env', 'php', 'hs', 'hsc', 'lua', 
  'nginxconf', 'conf', 'm', 'mm', 'plsql', 'perl', 'rb', 'rs', 'db2', 
  'scala', 'bash', 'swift', 'vue', 'svelte', 'doc', 'docx', 'pdf', 'csv', 
  'txt', 'xls', 'xlsx', 'pptx', 'ppt', 'msg'
];

export const PASTED_TEXT_CHARACTER_LIMIT = 1000;