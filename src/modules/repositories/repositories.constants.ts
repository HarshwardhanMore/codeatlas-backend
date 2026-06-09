export const ZIP_UPLOAD_FIELD_NAME = 'file';
export const ABSOLUTE_ZIP_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;
export const ZIP_EXTERNAL_ID_PREFIX = 'zip';
export const ZIP_URL_SCHEME = 'zip';
export const MAX_SAFE_UPLOAD_NAME_LENGTH = 120;

export const ALLOWED_ZIP_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
  'multipart/x-zip',
]);
